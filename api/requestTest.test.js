/*
  requestTest.test.js
  Tests for api/requestTest.js using the fixture corpus, with mocked side effects.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const apiUtil = require('./util');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
let processTestRequestCalls = [];

before(() => {
  process.env.DB_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'db');
  processTestRequestCalls = [];
  apiUtil.processTestRequest = async (testType, what, url, reason) => {
    processTestRequestCalls.push({testType, what, url, reason});
  };
});

// Require requestTest after the mock is in place, so it captures the mocked processTestRequest.
const {response} = require('./requestTest');

after(() => {
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
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestTest rejects a description longer than 100 characters', async () => {
  const longWhat = 'x'.repeat(101);
  const body = await response([longWhat, 'https://example.com/test', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestTest rejects a URL shorter than 12 characters', async () => {
  const body = await response(['Test Page', 'short', 'A reason that is long enough.']);
  assert.ok(body['response content']['details about your request'].error);
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestTest rejects an already-tested page', async () => {
  const body = await response(['Mixed Outcomes Page', 'https://example.com/mixed', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('already been tested'));
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestTest accepts a valid new page request', async () => {
  const body = await response(['Brand New Page', 'https://example.com/brandnew', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details['page to be tested'].description, 'Brand New Page');
  assert.equal(processTestRequestCalls.length, 1);
  assert.equal(processTestRequestCalls[0].testType, 'test');
});

test('requestTest includes disposition information for a valid request', async () => {
  const body = await response(['Brand New Page', 'https://example.com/brandnew', 'A reason that is long enough.']);
  const disposition = body['response content']['disposition of your request'];
  assert.ok(disposition);
  assert.ok(disposition['what happens next']);
});
