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

/*
Handlebars.registerHelper({});
const template = Handlebars.compile(view, options);
console.log(template({}));
*/

/**
 * Builds a template file.
 * @param {BuildOptions} options
 */
export const build = (options) => console.log(options);
