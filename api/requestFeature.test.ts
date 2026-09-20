/*
  requestFeature.test.ts
  Tests for api/requestFeature.ts with mocked side effects.
*/

// IMPORTS

import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';

// Blank the alert configuration unconditionally, before ./requestFeature.ts (which
// calls sendAlert) is ever imported below, so this file sends no real alert emails
// even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// SETUP AND TEARDOWN

let logged: any[] = [];
const originalLog = console.log;

// Capture console.log so the alert sendAlert emits can be observed. The alert
// configuration is blanked above, so sendAlert logs a WARNING instead of sending.
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
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error);
  assert.ok(
    !logged.some(line => line.startsWith('WARNING (Kilotest: MCP feature request received)'))
  );
});

test('requestFeature rejects a feature request shorter than 20 characters', async () => {
  const body = await response(['Too short']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('feature description'));
  assert.ok(
    !logged.some(line => line.startsWith('WARNING (Kilotest: MCP feature request received)'))
  );
});

test('requestFeature rejects a feature request longer than 1000 characters', async () => {
  const body = await response(['x'.repeat(1001)]);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('feature description'));
  assert.ok(
    !logged.some(line => line.startsWith('WARNING (Kilotest: MCP feature request received)'))
  );
});

test('requestFeature accepts a non-empty feature request and notifies the manager', async () => {
  const body = await response(['Add a dark mode toggle']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  assert.ok(details['date and time received']);
  assert.equal(details.disposition, 'received and logged; manager notified');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: MCP feature request received)')
    && line.includes('Add a dark mode toggle')
  ));
});

test('requestFeature includes tool name and metadata', async () => {
  const body = await response(['A sufficiently long feature description']);
  assert.equal(body['tool name'], 'requestFeature');
  assert.ok(body['response metadata'].identifier);
});
