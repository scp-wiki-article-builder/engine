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
} from 'scpwiki-handlebars-util';

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

    data: 'object',
};

/**
 * Builds a template file.
 * @param {BuildOptions} options
 * @param {string} configFilePath
 */
export const build = async (options, configFilePath) => {
    await _build(options, configFilePath)
        .catch((e) => {
            if (e instanceof ValidationException) {
                printValidationException(e);
            } else if (e instanceof ComponentException) {
                printComponentException(e);
            } else if (e instanceof RuntimeException) {
                printRuntimeException(e);
            } else {
                handleOtherExceptions(e);
            }
        });
};

/**
 * Builds a template file.
 * No catch.
 * @param {BuildOptions} options
 * @param {string} configFilePath
 */
export const _build = async (options, configFilePath) => {
    const h = Handlebars.create();

    checkNamedParams(buildOptionsSpec, options);

    registerComponents(options, h);
    await registerPartials(options, h);
    const strings = loadStrings(options, configFilePath);
    const entryFileContent = await loadEntryFileContent(options);

    const template = h.compile(entryFileContent, handlebarsOptions);
    const generatedText = template(options.data, {
        data: {
            config: options,
            strings
        }
    });

    await writeGeneratedText(options, generatedText);
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
const writeGeneratedText = async (options, generatedText) => {
    await fs.mkdir(options.output.dir, { recursive: true })
        .catch(() => {
            throw new RuntimeException(
                `Cannot create output directory: ${options.output.dir}`,
                'Is the path correct? Do you have write privileges on the parent directory?'
            );
        });

    const outputFilePath = path.resolve(options.output.dir, options.output.filename);
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
const handleOtherExceptions = (e) => {
    console.error(`Unexpected error:\n${e}`.red);
};
