/*
  orderNewTest.test.ts
  Tests for api/orderNewTest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';

// Blank the alert configuration unconditionally, before ./orderNewTest.ts (whose orderJob
// calls no alert directly, but whose redirect-rejection branch does) is ever imported
// below, so this file sends no real alert emails even when run directly rather than via
// `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
// Allow internal targets by default, so tests that submit an ordinary https://example.com/...
// URL do not depend on real DNS/network access to pass the resolution check that
// isAllowedTarget performs.
process.env.ALLOW_INTERNAL_TARGETS = 'true';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const queuePath = path.join(fixtureDBDir, 'jobs', 'queue');
let logged: any[] = [];
const originalLog = console.log;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

// Empty the job queue and capture console.log before each test, so tests are
// order-independent and any queued jobs a test creates do not leak into later tests.
beforeEach(async () => {
  for (const fileName of await fs.readdir(queuePath)) {
    await fs.unlink(path.join(queuePath, fileName));
  }
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

import {response} from './orderNewTest.ts';

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

test('orderNewTest rejects an empty description', async () => {
  const body = await response(['', 'https://example.com/test', 'A reason that is long enough.']);
  assert.ok((body['response content']['details about your order'] as any).error);
});

test('orderNewTest rejects a reason shorter than 20 characters', async () => {
  const body = await response(['Ordered Page', 'https://example.com/ordered', 'short']);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('reason'));
});

test('orderNewTest rejects a reason longer than 100 characters', async () => {
  const longReason = 'x'.repeat(101);
  const body = await response(['Ordered Page', 'https://example.com/ordered', longReason]);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('reason'));
});

test('orderNewTest rejects a URL shorter than 12 characters', async () => {
  const body = await response(['Test Page', 'short', 'A reason that is long enough.']);
  assert.ok((body['response content']['details about your order'] as any).error);
});

test('orderNewTest rejects a syntactically invalid URL with the correct length', async () => {
  const body = await response(['Test Page', 'not-a-valid-url', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('invalid URL'));
});

test('orderNewTest rejects a private-address URL unless internal targets are allowed', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  try {
    const body = await response(['Internal Page', 'https://192.168.1.1/page', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('orderNewTest rejects a URL that redirects to a disallowed target, and alerts a manager', async (t) => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  t.mock.method(globalThis, 'fetch', async () => ({url: 'https://10.0.0.5/page'}) as Response);
  try {
    const body = await response(['Redirecting Page', 'https://example.com/redirector', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
    assert.ok(logged.some(line =>
      line.includes('WARNING (Kilotest: instant-test order rejected for redirecting to a disallowed target)')
      && line.includes('https://example.com/redirector')
    ));
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('orderNewTest rejects an already-tested page', async () => {
  const body = await response(['Mixed Outcomes Page', 'https://example.com/mixed', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your order'] as any;
  assert.ok(
    disposition['what happens next']
    .includes('a report about a page with the same description or URL is available.')
  );
  assert.equal(disposition['report identifier'], null);
});

test('orderNewTest rejects a page matching a claimed job by description', async () => {
  const claimedPath = path.join(fixtureDBDir, 'jobs', 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, JSON.stringify({
    target: {what: 'Claimed Test Page', url: 'https://example.com/claimed-job'}
  }));
  try {
    const body = await response(['Claimed Test Page', 'https://example.com/other-url', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your order'] as any;
    assert.ok(
      disposition['what happens next']
      .includes('a request to test a page with the same description is already approved.')
    );
  }
  finally {
    await fs.unlink(claimedPath);
  }
});

test('orderNewTest rejects a page matching a queued job by URL', async () => {
  const queuedPath = path.join(fixtureDBDir, 'jobs', 'queue', 'que.json');
  await fs.writeFile(queuedPath, JSON.stringify({
    target: {what: 'Some Other Page', url: 'https://example.com/queued-url'}
  }));
  try {
    const body = await response(['A Different Page', 'https://example.com/queued-url', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your order'] as any;
    assert.ok(
      disposition['what happens next']
      .includes('a request to test a page with the same URL is already approved.')
    );
  }
  finally {
    await fs.unlink(queuedPath);
  }
});

test('orderNewTest rejects an order once the job queue is full', async () => {
  process.env.JOB_QUEUE_MAX = '0';
  const fillerPaths = await Promise.all(Array.from({length: 1}, async (_, i) => {
    const fillerPath = path.join(fixtureDBDir, 'jobs', 'queue', `fil${i}.json`);
    await fs.writeFile(fillerPath, JSON.stringify({target: {what: `Filler ${i}`, url: `https://example.com/filler${i}`}}));
    return fillerPath;
  }));
  delete process.env.JOB_QUEUE_MAX;
  process.env.JOB_QUEUE_MAX = '1';
  try {
    const body = await response(['One Too Many Page', 'https://example.com/one-too-many', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your order'] as any;
    assert.ok(disposition['what happens next'].includes('too many requests are awaiting approval right now.'));
  } finally {
    delete process.env.JOB_QUEUE_MAX;
    await Promise.all(fillerPaths.map(p => fs.unlink(p)));
  }
});

test('orderNewTest accepts a valid new page order and enqueues a job directly', async () => {
  const body = await response(['Brand New Ordered Page', 'https://example.com/brandnewordered', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.equal(details.error, undefined);
  assert.equal(details['page to be tested'].description, 'Brand New Ordered Page');
  const disposition = body['response content']['disposition of your order'] as any;
  assert.ok(disposition['report identifier']);
  assert.match(disposition['report identifier'].timeStamp, /^\d{6}T\d{4}$/);
  assert.match(disposition['report identifier'].jobID, /^[a-z0-9]{3}$/);
  assert.ok(disposition['what happens next'].includes('Testing has begun.'));
  assert.ok(disposition['do you want to wait for completion'].includes('awaitTest'));
  const queuedFiles = await fs.readdir(queuePath);
  assert.equal(queuedFiles.length, 1);
  const job = JSON.parse(await fs.readFile(path.join(queuePath, queuedFiles[0]!), 'utf8'));
  assert.equal(job.target.what, 'Brand New Ordered Page');
  assert.equal(job.sources.reason, 'A reason that is long enough.');
});

test('orderNewTest response omits a web UI URL for this request but includes the ancestor', async () => {
  const body = await response(['Brand New Ordered Page 2', 'https://example.com/brandnewordered2', 'A reason that is long enough.']);
  const similarWeb = body['URLs of similar requests for web users'] as any;
  assert.equal(similarWeb['this request'], null);
  assert.ok(similarWeb['closest ancestor request'].includes('listReports.html'));
});
