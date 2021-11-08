import path from 'path';
import fs from 'fs/promises';

import colors from 'colors';

import { Service } from './Service.js';

/**
 * @typedef {import('..').BuildOptions} BuildOptions
 */

/**
 * @typedef {Object} RegisteredImage
 * @property {string} inputPath
 * @property {string} outputPath
 */

export class ImageService extends Service {
    /**
     * @type {RegisteredImage[]}
     */
    images = [];

    /**
     * @param {BuildOptions} options
     */
    constructor(options) {
        super(ImageService.name, options);
    }

    /**
     * Creates an unique output path for an input image path.
     *
     * If a file named "image.png" is already registered then
     * the output filename for another file named the same is
     * "image_N.png" where N is the first integer that produces
     * an unique filename.
     * @param {string} inputPath
     * @returns {string}
     */
    _findUniqueOutputPath(inputPath) {
        const outputDir = this.options.output.dir;

        const createOutputPath = (n = 0) => {
            const suffix = n > 0 ? `_${n}` : '';
            const extension = path.extname(inputPath);
            const filename = `${path.basename(inputPath, extension)}${suffix}${extension}`;
            return path.resolve(outputDir, filename);
        };

        let outputPath = createOutputPath();
        for (let i = 1; this.images.filter(image => image.outputPath === outputPath).length > 0; i++) {
            outputPath = createOutputPath(i);
        }

        return outputPath;
    }

    /**
     * Registers an image file to be copied to output directory after build completion.
     * Returns the image path when uploaded to the wiki.
     * If an image is already registered it simply returns its wiki path.
     * @param {string} imageAbsolutePath
     * @returns {string}
     */
    registerImage(imageAbsolutePath) {
        let outputPath = null;
        const alreadyRegisteredImage =
            this.images.filter(image => image.inputPath === imageAbsolutePath)[0];

        if (!alreadyRegisteredImage) {
            outputPath = this._findUniqueOutputPath(imageAbsolutePath);

            this.images.push({
                inputPath: imageAbsolutePath,
                outputPath
            });
        } else {
            outputPath = alreadyRegisteredImage.outputPath;
        }

        const inputFilename = path.basename(imageAbsolutePath);
        const outputFilename = path.basename(outputPath);

        if (outputFilename !== inputFilename) {
            console.info(`Image file ${imageAbsolutePath} is outputted as ${outputFilename} to avoid name clashes.`.blue);
        }

        const { wikiName, pageName } = this.options;
        return `http://${wikiName}.wikidot.com/local--files/${pageName}/${outputFilename}`;
    }

    /**
     * Copies registered images to output directory after build completion.
     */
    async afterBuild() {
        for (let image of this.images) {
            try {
                await fs.copyFile(image.inputPath, image.outputPath);
            } catch (e) {
                this.error(
                    `Error while trying to copy ${image.inputPath} to ${image.outputPath}.\n` +
                    `Reason: ${e.message}.`
                );
            }
        }
    }
}
