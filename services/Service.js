import { RuntimeException } from '@scp-wiki-article-builder/util';

/**
 * @typedef {import('..').BuildOptions} BuildOptions
 */

export class Service {
    /**
     * @param {string} serviceName
     * @param {BuildOptions} options
     */
    constructor(serviceName, options) {
        this,serviceName = serviceName;
        this.options = options;
    }

    /**
     * Throws an exception from a service.
     * @param {string} message
     * @param {string?} info
     * @throws {RuntimeException}
     */
    error(message, info = null) {
        throw new RuntimeException(
            `Error in service "${this.serviceName}": ${message}`,
            info
        );
    }

    async beforeBuild() {}
    async afterBuild() {}
}
