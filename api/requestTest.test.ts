/*
  requestTest.test.ts
  Tests for api/requestTest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';

// Blank the alert configuration unconditionally, before ./requestTest.ts (whose
// processTestRequest calls sendAlert) is ever imported below, so this file sends no
// real alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
// Allow internal targets by default, so tests that submit an ordinary https://example.com/...
// URL do not depend on real DNS/network access to pass the resolution check that
// isAllowedTarget performs. The test of the check itself (below) overrides this.
process.env.ALLOW_INTERNAL_TARGETS = 'true';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const testRequestsPath = path.join(fixtureDBDir, 'jobs', 'testRequests.json');
let logged: any[] = [];
const originalLog = console.log;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

// Reset the test-requests file and capture console.log, so the alert that
// processTestRequest emits can be observed and tests are order-independent.
beforeEach(async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

import {response} from './requestTest.ts';

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
  assert.ok((body['response content']['details about your request'] as any).error);
  assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
});

test('requestTest rejects a description longer than 100 characters', async () => {
  const longWhat = 'x'.repeat(101);
  const body = await response([longWhat, 'https://example.com/test', 'A reason that is long enough.']);
  assert.ok((body['response content']['details about your request'] as any).error);
  assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
});

test('requestTest rejects a URL shorter than 12 characters', async () => {
  const body = await response(['Test Page', 'short', 'A reason that is long enough.']);
  assert.ok((body['response content']['details about your request'] as any).error);
  assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
});

test('requestTest rejects a syntactically invalid URL with the correct length', async () => {
  const body = await response(['Test Page', 'not-a-valid-url', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('invalid URL'));
  assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
});

test('requestTest rejects a private-address URL unless internal targets are allowed', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  try {
    const body = await response(['Internal Page', 'https://192.168.1.1/page', 'A reason that is long enough.']);
    const details = body['response content']['details about your request'] as any;
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
    assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('requestTest rejects a URL that redirects to a disallowed target, and alerts a manager', async (t) => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  t.mock.method(globalThis, 'fetch', async () => ({url: 'https://10.0.0.5/page'}) as Response);
  try {
    const body = await response(['Redirecting Page', 'https://example.com/redirector', 'A reason that is long enough.']);
    const details = body['response content']['details about your request'] as any;
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
    assert.ok(logged.some(line =>
      line.includes('WARNING (Kilotest: request rejected for redirecting to a disallowed target)')
      && line.includes('https://example.com/redirector')
    ));
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('requestTest rejects an already-tested page', async () => {
  const body = await response(['Mixed Outcomes Page', 'https://example.com/mixed', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  // A report for this description and URL already exists, so processTestRequest
  // returns 'retest' and the failure is reported via the disposition, not details.error.
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your request'] as any;
  assert.ok(
    disposition['what happens next']
    .includes('a report about a page with the same description and URL is available.')
  );
  assert.ok(!logged.some(line => line.includes('new test request awaits approval')));
});

test('requestTest rejects a page matching a claimed job by description', async () => {
  const claimedPath = path.join(fixtureDBDir, 'jobs', 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, JSON.stringify({
    target: {what: 'Claimed Test Page', url: 'https://example.com/claimed-job'}
  }));
  try {
    const body = await response(['Claimed Test Page', 'https://example.com/other-url', 'A reason that is long enough.']);
    const details = body['response content']['details about your request'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your request'] as any;
    assert.ok(
      disposition['what happens next']
      .includes('a request to test a page with the same description is already approved.')
    );
  }
  finally {
    await fs.unlink(claimedPath);
  }
});

test('requestTest rejects a page matching a queued job by URL', async () => {
  const queuedPath = path.join(fixtureDBDir, 'jobs', 'queue', 'que.json');
  await fs.writeFile(queuedPath, JSON.stringify({
    target: {what: 'Some Other Page', url: 'https://example.com/queued-url'}
  }));
  try {
    const body = await response(['A Different Page', 'https://example.com/queued-url', 'A reason that is long enough.']);
    const details = body['response content']['details about your request'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your request'] as any;
    assert.ok(
      disposition['what happens next']
      .includes('a request to test a page with the same URL is already approved.')
    );
  }
  finally {
    await fs.unlink(queuedPath);
  }
});

test('requestTest rejects a duplicate request', async () => {
  await response(['Duplicate API Page', 'https://example.com/dup-api', 'A reason that is long enough.']);
  const body = await response(['Duplicate API Page', 'https://example.com/dup-api', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your request'] as any;
  assert.ok(disposition['what happens next'].includes('an identical request is already awaiting approval.'));
});

test('requestTest accepts a valid new page request', async () => {
  const body = await response(['Brand New Page', 'https://example.com/brandnew', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  assert.equal(details['page to be tested'].description, 'Brand New Page');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: new test request awaits approval)')
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
