import fs from 'fs/promises';
import path from 'path';

import Handlebars from 'handlebars';
import colors from 'colors';

import {
    checkNamedParams,
    ValidationException,
    ComponentTypeCheckError,
    TypeCheckError,
} from 'scpwiki-handlebars-util';

/**
 * @typedef {Object} BuildOptions
 * @property {string} entry
 * @property {string} partialsDir
 * @property {{ dir: string, filename: string }} output
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

    output: () => ({
        dir: 'string',
        filename: 'string'
    }),

    data: 'object',

    components: 'components'
};

/**
 * Builds a template file.
 * @param {BuildOptions} options
 */
export const build = async (options) => {
    try {
        await _build(options);
    } catch (e) {
        if (e instanceof ValidationException) {
            printValidationException(e);
        } else {
            console.error(e);
        }
    }
};

/**
 * Builds a template file.
 * No catch.
 * @param {BuildOptions} options
 */
export const _build = async (options) => {
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

    const entryFile = await fs.open(options.entry, 'r');
    const entryFileContent = await entryFile.readFile('utf-8');
    await entryFile.close();

    const template = h.compile(entryFileContent, handlebarsOptions);
    const generatedText = template(options.data, {
        data: {
            config: options
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
