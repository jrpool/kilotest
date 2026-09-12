/*
  test/dbFixture.ts
  Provides a disposable copy of the fixture database, so that tests never modify the tracked fixtures in test/fixtures/db.
*/

// IMPORTS

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CONSTANTS

// Path of this process' temporary copy of the fixture database.
export const fixtureDBDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-db-'));

// Copy the tracked fixture database to the temporary directory.
fs.cpSync(path.join(import.meta.dirname, 'fixtures', 'db'), fixtureDBDir, {recursive: true});

// Remove the copy when the process exits.
process.on('exit', () => fs.rmSync(fixtureDBDir, {recursive: true, force: true}));
