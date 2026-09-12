/*
  requestTest.test.cjs
  Tests for api/requestTest.ts using the fixture corpus.
*/

// IMPORTS

const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {fixtureDBDir} = require('../test/dbFixture.cjs');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const recsPath = path.join(fixtureDBDir, 'jobs', 'recs.json');
let logged = [];
const originalLog = console.log;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

// Reset the recommendations file and capture console.log, so the alert that
// processTestRequest emits can be observed and tests are order-independent.
beforeEach(async () => {
  await fs.writeFile(recsPath, '{}\n');
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

const {response} = require('./requestTest.cts');

after(() => {
  console.log = originalLog;
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('requestTest rejects an empty description', async () => {
  const body = await response(['', 'https://example.com/test', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestTest rejects a description longer than 100 characters', async () => {
  const longWhat = 'x'.repeat(101);
  const body = await response([longWhat, 'https://example.com/test', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestTest rejects a URL shorter than 12 characters', async () => {
  const body = await response(['Test Page', 'short', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestTest rejects a syntactically invalid URL with the correct length', async () => {
  const body = await response(['Test Page', 'not-a-valid-url', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('invalid URL'));
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestTest rejects an already-tested page', async () => {
  const body = await response(['Mixed Outcomes Page', 'https://example.com/mixed', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('already been tested'));
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestTest accepts a valid new page request', async () => {
  const body = await response(['Brand New Page', 'https://example.com/brandnew', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details['page to be tested'].description, 'Brand New Page');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: new test recommendation in the API)')
    && line.includes('Brand New Page')
    && line.includes('https://example.com/brandnew')
  ));
});

test('requestTest includes disposition information for a valid request', async () => {
  const body = await response(['Brand New Page', 'https://example.com/brandnew', 'A reason that is long enough.']);
  const disposition = body['response content']['disposition of your request'];
  assert.ok(disposition);
  assert.ok(disposition['what happens next']);
});
