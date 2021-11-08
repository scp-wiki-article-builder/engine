#!/usr/bin/env node

import path from 'path';

import colors from 'colors';

import {
    build,
    loadBuildConfig,
    createOutputDir,
    writeToOutputFile,
    printException
} from '../index.js';

if (process.argv.length !== 3) {
    console.error('You must specify the path to the build config file.')
}

const configPath = path.resolve(process.cwd(), process.argv[2]);

try {
    const options = await loadBuildConfig(configPath);
    await createOutputDir(options);
    const generatedText = await build(options, configPath);
    if (generatedText) {
        await writeToOutputFile(options, generatedText);
    }
} catch (e) {
    printException(e);
}
