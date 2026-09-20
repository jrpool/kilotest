/*
  requestFeature.test.ts
  Tests for api/requestFeature.ts with mocked side effects.
*/

// IMPORTS

import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Blank the alert configuration unconditionally, before ./requestFeature.ts (which
// calls sendAlert) is ever imported below, so this file sends no real alert emails
// even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// ENVIRONMENT

const testDir = path.join(import.meta.dirname, '../test/fixtures/featureRequests');
process.env.FEATURE_REQUESTS_PATH = path.join(testDir, 'featureRequests.json');

// SETUP AND TEARDOWN

let logged: any[] = [];
const originalLog = console.log;

// Capture console.log so the alert sendAlert emits can be observed. The alert
// configuration is blanked above, so sendAlert logs a WARNING instead of sending.
beforeEach(async () => {
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  await fs.mkdir(testDir, {recursive: true});
  await fs.writeFile(process.env.FEATURE_REQUESTS_PATH!, '[]\n');
});

import {response} from './requestFeature.ts';

after(async () => {
  console.log = originalLog;
  await fs.rm(testDir, {recursive: true, force: true});
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

test('requestFeature records a valid feature request to the feature-requests file', async () => {
  await response(['Add a dark mode toggle to the reports page']);
  const featureRequests = JSON.parse(await fs.readFile(process.env.FEATURE_REQUESTS_PATH!, 'utf8'));
  assert.equal(featureRequests.length, 1);
  assert.equal(featureRequests[0].content, 'Add a dark mode toggle to the reports page');
  assert.ok(featureRequests[0].timeStamp);
});

test('requestFeature appends to, rather than overwrites, existing feature requests', async () => {
  await response(['First feature request of at least 20 characters']);
  await response(['Second feature request of at least 20 characters']);
  const featureRequests = JSON.parse(await fs.readFile(process.env.FEATURE_REQUESTS_PATH!, 'utf8'));
  assert.equal(featureRequests.length, 2);
});

test('requestFeature does not record an invalid feature request', async () => {
  await response(['short']);
  const featureRequests = JSON.parse(await fs.readFile(process.env.FEATURE_REQUESTS_PATH!, 'utf8'));
  assert.equal(featureRequests.length, 0);
});

test('requestFeature creates the feature-requests file when it does not exist', async () => {
  await fs.unlink(process.env.FEATURE_REQUESTS_PATH!);
  await response(['A feature request when no file yet exists']);
  const featureRequests = JSON.parse(await fs.readFile(process.env.FEATURE_REQUESTS_PATH!, 'utf8'));
  assert.equal(featureRequests.length, 1);
  assert.equal(featureRequests[0].content, 'A feature request when no file yet exists');
});
