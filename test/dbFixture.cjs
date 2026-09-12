/*
  test/dbFixture.cjs
  Provides a disposable copy of the fixture database, so that tests never modify the tracked fixtures in test/fixtures/db.
*/

// IMPORTS

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// CONSTANTS

// Path of this process' temporary copy of the fixture database.
const fixtureDBDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-db-'));

// Copy the tracked fixture database to the temporary directory.
fs.cpSync(path.join(__dirname, 'fixtures', 'db'), fixtureDBDir, {recursive: true});

// Remove the copy when the process exits.
process.on('exit', () => fs.rmSync(fixtureDBDir, {recursive: true, force: true}));

// EXPORTS

exports.fixtureDBDir = fixtureDBDir;
