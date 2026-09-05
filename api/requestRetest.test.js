/*
  requestRetest.test.js
  Tests for api/requestRetest.js using the fixture corpus, with mocked side effects.
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
  // @ts-expect-error: Replacing the real function with a mock for testing.
  apiUtil.processTestRequest = async (testType, what, url, reason) => {
    processTestRequestCalls.push({testType, what, url, reason});
  };
});

// Require requestRetest after the mock is in place, so it captures the mocked processTestRequest.
const {response} = require('./requestRetest');

after(() => {
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
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestRetest rejects a superseded report', async () => {
  const body = await response(['260101T0000', 'mix', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('later report'));
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestRetest rejects a reason shorter than 20 characters', async () => {
  const body = await response(['260101T0001', 'ct', 'short']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('reason'));
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestRetest rejects a reason longer than 100 characters', async () => {
  const longReason = 'x'.repeat(101);
  const body = await response(['260101T0001', 'ct', longReason]);
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('reason'));
  assert.equal(processTestRequestCalls.length, 0);
});

test('requestRetest accepts a valid retest request for the latest report of a page', async () => {
  const body = await response(['260202T0000', 'new', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details['page to be retested'].description, 'Mixed Outcomes Page');
  assert.equal(processTestRequestCalls.length, 1);
  assert.equal(processTestRequestCalls[0].testType, 'retest');
});
