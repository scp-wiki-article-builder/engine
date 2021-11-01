import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

import Handlebars from 'handlebars';
import colors from 'colors';

import {
    checkNamedParams,
    ValidationException,
    ComponentTypeCheckError,
    TypeCheckError,
    RuntimeException,
    ComponentException,
} from '@scp-wiki-article-builder/util';

/**
 * @typedef {Object} BuildOptions
 * @property {string} entry
 * @property {string} partialsDir
 * @property {string} stringsDir
 * @property {{ dir: string, filename: string }} output
 * @property {string} locale
 * @property {any} data
 * @property {Handlebars.HelperDeclareSpec} components
 */

const handlebarsOptions = {
    noEscape: true,
    strict: true
};

const buildOptionsSpec = {
    entry: 'string',
    partialsDir: 'string',
    stringsDir: 'string',

    output: () => ({
        dir: 'string',
        filename: 'string'
    }),
    locale: 'string',

    components: 'components',

    subProjects: { type: 'object', optional: true },

    data: 'object',
};

/**
 * Loads a project build config file.
 * @param {string} configPath
 * @returns {Promise<BuildOptions>}
 */
export const loadBuildConfig = async (configPath) => {
    let buildOptions = null;

    try {
        const configModule  = await import(configPath);
        buildOptions = configModule.default;
    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            throw new RuntimeException(
                `Cannot load build config file: ${configPath}`,
                'Is it the correct path?'
            );
        } else {
            throw e;
        }
    }

    return buildOptions;
};

/**
 * Prints a thrown exception.
 * @param {any} e
 */
export const printException = (e) => {
    if (e instanceof ValidationException) {
        printValidationException(e);
    } else if (e instanceof ComponentException) {
        printComponentException(e);
    } else if (e instanceof RuntimeException) {
        printRuntimeException(e);
    } else {
        printOtherExceptions(e);
    }
};

/**
 * Builds a template file.
 * @param {BuildOptions} options
 * @param {string} configFilePath
 * @returns {Promise<string>}
 */
export const build = async (options, configFilePath) => {
    let generatedText = null;

    try {
        generatedText = await buildWithNoErrorHandling(options, configFilePath)
    } catch(e) {
        printException(e);
    }

    return generatedText;
};

/**
 * Builds a template file.
 * Exceptions are not handled.
 * @param {BuildOptions} options
 * @param {string} configFilePath
 * @returns {Promise<string>}
 */
export const buildWithNoErrorHandling = async (options, configFilePath) => {
    const h = Handlebars.create();

    checkNamedParams(buildOptionsSpec, options);

    registerComponents(options, h);
    await registerPartials(options, h);
    const subProjectsData = await loadSubProjectsData(options);
    const strings = loadStrings(options, configFilePath);
    const entryFileContent = await loadEntryFileContent(options);

    const template = h.compile(entryFileContent, handlebarsOptions);

    return template(options.data, {
        data: {
            ...subProjectsData,
            // We add these values after the sub-projects data
            // to prevent overwriting them.
            config: options,
            strings
        }
    });
};

/**
 * Registers the supplied components.
 * @param {BuildOptions} options
 * @param {Handlebars} h
 */
const registerComponents = (options, h) => {
    h.registerHelper({ ...options.components });
};

/**
 * Registers the supplied partials.
 * @param {BuildOptions} options
 * @param {Handlebars} h
 * @returns {Promise<void>}
 */
const registerPartials = async (options, h) => {
    const partialsDir = await fs.opendir(options.partialsDir)
        .catch(() => {
            throw new RuntimeException(
                `Cannot open partials directory: ${options.partialsDir}`,
                'Is the path correct? Do you have read privileges on the directory?'
            );
        });

    for await (let dirent of partialsDir) {
        const partialFilePath = path.resolve(options.partialsDir, dirent.name);
        const partialName = path.basename(partialFilePath, path.extname(partialFilePath));
        const partialFile = await fs.open(partialFilePath, 'r')
            .catch(() => {
                throw new RuntimeException(
                    `Cannot open partial file: ${partialFilePath}`,
                    'Do you have read privileges on the file?'
                );
            });

        const partialFileContent = await partialFile.readFile('utf-8')
            .catch(() => {
                throw new RuntimeException(
                    `Cannot read partial file: ${partialFilePath}`,
                    'A reality bender might be playing your storage device...'
                );
            });

        h.registerPartial(partialName, partialFileContent);

        await partialFile.close()
            .catch(() => {
                throw new RuntimeException(
                    `Cannot close partial file: ${partialFilePath}`,
                    'A reality bender might be playing your storage device...'
                );
            });
    }
};

/**
 * Loads the data of all sub-projects.
 * @param {BuildOptions} options
 * @returns {Promise<any>}
 */
const loadSubProjectsData = async (options) => {
    const subProjectsData = {};

    if (options.subProjects) {
        for (let subProjectName in options.subProjects) {
            const configPath = options.subProjects[subProjectName];
            const buildOptions = await loadBuildConfig(configPath);
            subProjectsData[subProjectName] = buildOptions.data;
        };
    }

    return subProjectsData;
};

/**
 * Loads the localized strings of the project according to the 'locale' option.
 * @param {BuildOptions} options
 * @param {string} configFilePath
 * @returns {any}
 */
const loadStrings = (options, configFilePath) => {
    let strings = null;

    const projectRequire = createRequire(`file://${configFilePath}`);
    // Build a relative path from the config dir to the JSON file
    // containing the localized strings
    const stringsAbsolutePath = path.resolve(options.stringsDir, `${options.locale}.json`);
    const stringsPath = `.${path.sep}${path.relative(
        path.dirname(configFilePath),
        stringsAbsolutePath
    )}`;

    try {
        strings = projectRequire(stringsPath);
    } catch (e) {
        throw new RuntimeException(
            `Cannot open localized strings file: ${stringsAbsolutePath}`,
            'Is the path correct? Do you have read privileges on the file?'
        );
    }

    return strings;
};

/**
 * Loads the content of the project entry file.
 * @param {BuildOptions} options
 * @returns {Promise<string>}
 */
const loadEntryFileContent = async (options) => {
    let entryFileContent = null;

    const entryFile = await fs.open(options.entry, 'r')
        .catch(() => {
            throw new RuntimeException(
                `Cannot open the entry file: ${options.entry}`,
                'Is the path correct? Do you have read privileges on the file?'
            );
        });

    entryFileContent = await entryFile.readFile('utf-8')
        .catch(() => {
            throw new RuntimeException(
                `Cannot read the entry file: ${options.entry}`
            );
        });
    await entryFile.close();

    return entryFileContent;
};

/**
 * Writes the generated text to the output file.
 * @param {BuildOptions} options
 * @param {string} generatedText
 * @returns {Promise<void>}
 */
export const writeToOutputFile = async (options, generatedText) => {
    const outputDirPath = interpolatePathTemplate(options, options.output.dir);
    const outputFileName = interpolatePathTemplate(options, options.output.filename);

    await fs.mkdir(outputDirPath, { recursive: true })
        .catch(() => {
            throw new RuntimeException(
                `Cannot create output directory: ${outputDirPath}`,
                'Is the path correct? Do you have write privileges on the parent directory?'
            );
        });

    const outputFilePath = path.resolve(outputDirPath, outputFileName);
    const outputFile = await fs.open(outputFilePath, 'w')
        .catch(() => {
            throw new RuntimeException(
                `Cannot open/create output file: ${outputFilePath}`,
                'Does a file for which you have no write privileges already exist? ' +
                'Do you have write privileges on the parent directory?'
            );
        });

    await outputFile.writeFile(generatedText, 'utf-8')
        .catch(() => {
            throw new RuntimeException(
                `Cannot write to ouput file: ${outputFilePath}`,
                'A reality bender might be playing your storage device...'
            );
        });

    await outputFile.close()
        .catch(() => {
            throw new RuntimeException(
                `Cannot close output file: ${outputFilePath}`,
                'A reality bender might be playing your storage device...'
            );
        });
};

/**
 * Interpolates a path with a minimal context (no helpers
 * or partials, no localized strings).
 * @param {BuildOptions} options
 * @param {string} pathTemplate
 * @returns {string}
 */
const interpolatePathTemplate = (options, pathTemplate) => {
    const h = Handlebars.create();

    const template = h.compile(pathTemplate, handlebarsOptions);
    const path = template(options.data, {
        data: {
            config: options
        }
    });

    return path;
};

/**
 * Prints the content of validation errors.
 * @param {ValidationException} e
 */
const printValidationException = (e) => {
    /** @type {Object<string, Array<ComponentTypeCheckError>>} */
    const componentsErrorsMap = {};
    /** @type {TypeCheckError[]} */
    const otherErrors = [];

    e.errors.forEach(error => {
        if (error instanceof ComponentTypeCheckError) {
            let list = componentsErrorsMap[error.componentName];
            if (!list) {
                list = [];
            }
            componentsErrorsMap[error.componentName] = [...list, error];
        } else if (error instanceof TypeCheckError) {
            otherErrors.push(error);
        }
    });

    Object.keys(componentsErrorsMap).forEach((componentName, i) => {
        if (i > 0) {
            console.error();
        }
        console.error(`Error(s) in component "${componentName}":`.red);
        componentsErrorsMap[componentName].forEach(error => {
            console.error(`- ${error.message}`.red)
        });
    });

    otherErrors.forEach(error => console.error(error.message.red));
};

/**
 * Prints a ComponentException.
 * @param {ComponentException} e
 */
const printComponentException = (e) => {
    console.error(`Error in component "${e.componentName}": ${e.message}`.red);
};

/**
 * Prints a RuntimeException.
 * @param {RuntimeException} e
 */
const printRuntimeException = (e) => {
    console.error(e.message.red);

    if (e.info) {
        console.log(e.info.cyan);
    }
};

/**
 * Handles exceptions thrown by Node.js or Handlebars.
 * @param {any} e
 */
const printOtherExceptions = (e) => {
    console.error(e);
};
