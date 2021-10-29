#!/usr/bin/env node

import path from 'path';

import colors from 'colors';

import { build } from '../index.js';

if (process.argv.length !== 3) {
    console.error('You must specify the path to the build config file.')
}

const configPath = path.resolve(process.cwd(), process.argv[2]);

try {
    const configModule = await import(configPath);
    await build(configModule.default, configPath);
} catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
        console.error(`Cannot load build config file: ${configPath}`.red);
    } else {
        console.error(`Unexpected error:\n${e}`.red);
    }
}
