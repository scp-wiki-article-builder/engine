import Handlebars from 'handlebars';

import {
    checkComponentHasChildren,
    checkComponentParam
} from '@scp-wiki-article-builder/util';

const componentName = '__file';

/**
 * Encloses text and set the current file path as a private varaible.
 * @module __file
 * @param {string} currentFilePath
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export default function (currentFilePath, options) {
    checkComponentHasChildren(componentName, options);
    checkComponentParam(componentName, 'string', currentFilePath);

    const data = Handlebars.createFrame(options.data || {});
    data.currentFilePath = currentFilePath;

    return options.fn(this, { data });
}
