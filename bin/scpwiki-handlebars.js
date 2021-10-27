#!/usr/bin/env node

import path from 'path';

import { build } from '../index.js';

if (process.argv.length !== 3) {
    console.error('You must specify the path to the build config file.')
}

const configPath = path.resolve(process.cwd(), process.argv[2]);

(async () => {
    const configModule = await import(configPath);
    await build(configModule.default, configPath);
})()
.catch((reason) => console.error(reason));
