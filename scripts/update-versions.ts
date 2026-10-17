/*
  update-versions.ts
  Copies the version field of package.json into the version fields of server.json and lhm.plugin.json, keeping package.json the single source of truth for the Kilotest version.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with {type: 'json'};

// CONSTANTS

const {version} = pkg;
const targetFiles = ['server.json', 'lhm.plugin.json'];

// FUNCTIONS

// Replaces the version field of a JSON file with the package.json version, leaving all other content byte-for-byte unchanged.
const updateVersion = (fileName: string): void => {
  const filePath = path.join(import.meta.dirname, '..', fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^(\s*)"version": "([^"]+)"/m);
  if (!match) {
    throw new Error(`No version field found in ${fileName}`);
  }
  const oldVersion = match[2];
  if (oldVersion === version) {
    console.log(`${fileName} already at version ${version}`);
    return;
  }
  fs.writeFileSync(filePath, content.replace(match[0], `${match[1]}"version": "${version}"`));
  console.log(`Updated ${fileName} version: ${oldVersion} → ${version}`);
};

// EXECUTION

targetFiles.forEach(updateVersion);
