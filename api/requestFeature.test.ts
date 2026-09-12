// Not yet under strict type checking (transitional).
// @ts-nocheck
/*
  requestFeature.test.ts
  Tests for api/requestFeature.ts with mocked side effects.
*/

// IMPORTS

import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';

// SETUP AND TEARDOWN

let logged = [];
const originalLog = console.log;

// Capture console.log so the alert sendAlert emits can be observed. The alert
// configuration is empty in tests, so sendAlert logs a WARNING instead of sending.
beforeEach(() => {
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

import {response} from './requestFeature.ts';

after(() => {
  console.log = originalLog;
});

// TESTS

test('requestFeature rejects an empty feature request', async () => {
  const body = await response(['']);
  const details = body['response content']['details about your request'];
  assert.ok(details.error);
  assert.ok(!logged.some(line => line.startsWith('WARNING (MCP feature request received)')));
});

test('requestFeature accepts a non-empty feature request and notifies the manager', async () => {
  const body = await response(['Add a dark mode toggle']);
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.ok(details['date and time received']);
  assert.equal(details.disposition, 'received and logged; manager notified');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (MCP feature request received)')
    && line.includes('Add a dark mode toggle')
  ));
});

test('requestFeature includes tool name and metadata', async () => {
  const body = await response(['Some feature']);
  assert.equal(body['tool name'], 'requestFeature');
  assert.ok(body['response metadata'].identifier);
});
