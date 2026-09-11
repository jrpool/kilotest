/*
  requestFeature.test.cjs
  Tests for api/requestFeature.ts with mocked side effects.
*/

// IMPORTS

const {test, beforeEach, after, mock} = require('node:test');
const assert = require('node:assert/strict');

// SETUP AND TEARDOWN

let sendAlertCalls = [];

// Mock the alert sender before requestFeature is required, so it captures the mock.
mock.module('../alerts.ts', {
  exports: {
    sendAlert: async (subject, body) => {
      sendAlertCalls.push({subject, body});
    }
  }
});

// Reset the call log before each test, so tests do not depend on execution order.
beforeEach(() => {
  sendAlertCalls = [];
});

const {response} = require('./requestFeature.cts');

after(() => {
});

// TESTS

test('requestFeature rejects an empty feature request', async () => {
  const body = await response(['']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error);
  assert.equal(sendAlertCalls.length, 0);
});

test('requestFeature accepts a non-empty feature request and notifies the manager', async () => {
  const body = await response(['Add a dark mode toggle']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.ok(details['date and time received']);
  assert.equal(details.disposition, 'received and logged; manager notified');
  assert.equal(sendAlertCalls.length, 1);
  assert.equal(sendAlertCalls[0].subject, 'MCP feature request received');
  assert.equal(sendAlertCalls[0].body, 'Add a dark mode toggle');
});

test('requestFeature includes tool name and metadata', async () => {
  const body = await response(['Some feature']);
  assert.equal(body['tool name'], 'requestFeature');
  assert.ok(body['response metadata'].identifier);
});
