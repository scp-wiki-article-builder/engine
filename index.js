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
    try {
        await _build(options, configFilePath);
    } catch (e) {
        if (e instanceof ValidationException) {
            printValidationException(e);
        } else if (e instanceof ComponentException) {
            printComponentException(e);
        } else if (e instanceof RuntimeException) {
            printRuntimeException(e);
        } else {
            console.error(e);
        }
    }
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

    h.registerHelper({ ...options.components });

    const partialsDir = await fs.opendir(options.partialsDir);
    for await (let dirent of partialsDir) {
        const partialFilePath = path.resolve(options.partialsDir, dirent.name);
        const partialName = path.basename(partialFilePath, path.extname(partialFilePath));
        const partialFile = await fs.open(partialFilePath, 'r');
        const partialFileContent = await partialFile.readFile('utf-8');

        h.registerPartial(partialName, partialFileContent);

        await partialFile.close();
    }

    const projectRequire = createRequire(`file://${configFilePath}`);
    // Build a relative path from the config dir to the JSON file
    // containing the localized strings
    const stringsAbsolutePath = path.resolve(options.stringsDir, `${options.locale}.json`);
    const stringsPath = `.${path.sep}${path.relative(
        path.dirname(configFilePath),
        stringsAbsolutePath
    )}`;
    let strings = null;
    try {
        strings = projectRequire(stringsPath);
    } catch (e) {
        throw new RuntimeException(`Cannot open locale file: ${stringsAbsolutePath}.`);
    }

    const entryFile = await fs.open(options.entry, 'r');
    const entryFileContent = await entryFile.readFile('utf-8');
    await entryFile.close();

    const template = h.compile(entryFileContent, handlebarsOptions);
    const generatedText = template(options.data, {
        data: {
            config: options,
            strings
        }
    });

    await fs.mkdir(options.output.dir, { recursive: true });
    const outputFilePath = path.resolve(options.output.dir, options.output.filename);
    const outputFile = await fs.open(outputFilePath, 'w');
    await outputFile.writeFile(generatedText, 'utf-8');
    await outputFile.close();
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
const printRuntimeException = (e) => console.error(e.message.red);
