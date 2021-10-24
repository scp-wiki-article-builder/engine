import fs from 'fs/promises';

import Handlebars from 'handlebars';

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

/**
 * Builds a template file.
 * @param {BuildOptions} options
 */
export const build = async (options) => {
    const h = Handlebars.create();

    h.registerHelper({ ...options.components });

    // TODO: register partials

    const entryFile = await fs.open(options.entry, 'r');
    const entryFileContent = await entryFile.readFile('utf-8');

    const template = h.compile(entryFileContent, handlebarsOptions);
    const generatedText = template(options.data);

    // TODO: Output file
    console.log(generatedText);
}
