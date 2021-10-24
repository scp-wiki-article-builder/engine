import fs from 'fs/promises';
import path from 'path';

import Handlebars from 'handlebars';
import { checkNamedParams } from 'scpwiki-handlebars-util';

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
    }

    const entryFile = await fs.open(options.entry, 'r');
    const entryFileContent = await entryFile.readFile('utf-8');

    const template = h.compile(entryFileContent, handlebarsOptions);
    const generatedText = template(options.data);

    await fs.mkdir(options.output.dir, { recursive: true });
    const outputFilePath = path.resolve(options.output.dir, options.output.filename);
    const outputFile = await fs.open(outputFilePath, 'w');
    await outputFile.writeFile(generatedText, 'utf-8');
};
