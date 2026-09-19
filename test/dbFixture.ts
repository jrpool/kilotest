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

// Git does not track empty directories, so the job-state subdirectories are absent
// from a fresh checkout even though they are part of the fixture layout. Create them
// here rather than tracking placeholder files, which readdir-based job listing would
// otherwise pick up as (invalid) job files.
for (const category of ['queue', 'claimed', 'failed']) {
  fs.mkdirSync(path.join(fixtureDBDir, 'jobs', category), {recursive: true});
}

// Remove the copy when the process exits.
process.on('exit', () => fs.rmSync(fixtureDBDir, {recursive: true, force: true}));
