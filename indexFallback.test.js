/*
  indexFallback.test.js
  Tests that index.js loads successfully when PROTOCOL and TESTARO_WORKERS
  are not set, exercising the || fallback branches at module load time.
  This must be a separate file because index.js reads these env vars
  at module load time, and each test file runs in its own process.
*/

// ENVIRONMENT (must be set before requiring index.js)

const path = require('node:path');
const fixtureDBDir = path.join(__dirname, 'test', 'fixtures', 'db');

process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
// Set PROTOCOL and TESTARO_WORKERS to empty strings (falsy) so that
// the || fallbacks in index.js are exercised. dotenv does not override
// existing env vars, so .env will not replace these.
process.env.PROTOCOL = '';
process.env.TESTARO_WORKERS = '';

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {requestHandler} = require('./index');

// TESTS

test('index.js loads with empty PROTOCOL and TESTARO_WORKERS using fallbacks', () => {
  // If index.js loaded successfully, requestHandler is a function.
  assert.equal(typeof requestHandler, 'function');
});
