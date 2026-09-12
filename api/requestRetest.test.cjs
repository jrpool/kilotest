/*
  requestRetest.test.cjs
  Tests for api/requestRetest.ts using the fixture corpus.
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

const {response} = require('./requestRetest.cts');

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

test('requestRetest rejects a nonexistent report', async () => {
  const body = await response(['999999T9999', 'xyz', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestRetest rejects a superseded report', async () => {
  const body = await response(['260101T0000', 'mix', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('later report'));
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestRetest rejects a reason shorter than 20 characters', async () => {
  const body = await response(['260101T0001', 'ct', 'short']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('reason'));
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestRetest rejects a reason longer than 100 characters', async () => {
  const longReason = 'x'.repeat(101);
  const body = await response(['260101T0001', 'ct', longReason]);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('reason'));
  assert.ok(!logged.some(line => line.includes('recommendation in the API')));
});

test('requestRetest accepts a valid retest request for the latest report of a page', async () => {
  const body = await response(['260202T0000', 'new', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details['page to be retested'].description, 'Mixed Outcomes Page');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: new retest recommendation in the API)')
    && line.includes('Mixed Outcomes Page')
    && line.includes('https://example.com/mixed')
  ));
});
