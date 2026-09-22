/*
  requestRetest.test.ts
  Tests for api/requestRetest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';

// Blank the alert configuration unconditionally, before ./requestRetest.ts (whose
// processTestRequest calls sendAlert) is ever imported below, so this file sends no
// real alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const testRequestsPath = path.join(fixtureDBDir, 'jobs', 'testRequests.json');
// A report added only to this test's disposable copy of the fixture database (never to
// the tracked test/fixtures/db corpus), so its 3-character job ID satisfies isJobID
// without perturbing report-count tests elsewhere that copy the whole corpus. Its job ID
// intentionally differs from the tracked corpus's 2-character 260101T0001-ct.json, which
// isJobID would reject.
const retestFixturePath = path.join(fixtureDBDir, 'reports', '260101T0003-ret.json');
const retestFixtureReport = {
  id: '260101T0003-ret',
  what: 'Retest Fixture Page',
  target: {what: 'Retest Fixture Page', url: 'https://example.com/retestfixture'},
  sources: {worker: 'test-worker'},
  acts: [],
  jobData: {startTime: '26-01-01T00:00', endTime: '26-01-01T00:10', elapsedSeconds: 600, preventions: {}, issuelessRules: []},
  catalog: {},
  images: {},
  checkpoints: []
};
let logged: any[] = [];
const originalLog = console.log;

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  await fs.writeFile(retestFixturePath, JSON.stringify(retestFixtureReport));
});

// Reset the test-requests file and capture console.log, so the alert that
// processTestRequest emits can be observed and tests are order-independent.
beforeEach(async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

import {response} from './requestRetest.ts';

after(async () => {
  console.log = originalLog;
  await fs.unlink(retestFixturePath);
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('requestRetest rejects a nonexistent report', async () => {
  const body = await response(['251231T0000', 'zzz', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('does not exist'));
  assert.ok(!logged.some(line => line.includes('new retest request awaits approval')));
});

test('requestRetest rejects a malformed timestamp or job identifier', async () => {
  const body = await response(['999999T9999', 'xyz', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('malformed'));
  assert.ok(!logged.some(line => line.includes('new retest request awaits approval')));
});

test('requestRetest rejects a superseded report', async () => {
  // 260101T0000-mix is an earlier report of "Mixed Outcomes Page" than 260202T0000-new,
  // so it is superseded and processTestRequest returns 'superseded', reported via the
  // disposition rather than details.error.
  const body = await response(['260101T0000', 'mix', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your request'] as any;
  assert.ok(
    disposition['what happens next'].includes('a later report about a page with the same description is available.')
  );
  assert.ok(!logged.some(line => line.includes('new retest request awaits approval')));
});

test('requestRetest rejects a reason shorter than 20 characters', async () => {
  const body = await response(['260101T0003', 'ret', 'short']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('reason'));
  assert.ok(!logged.some(line => line.includes('new retest request awaits approval')));
});

test('requestRetest rejects a reason longer than 100 characters', async () => {
  const longReason = 'x'.repeat(101);
  const body = await response(['260101T0003', 'ret', longReason]);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('reason'));
  assert.ok(!logged.some(line => line.includes('new retest request awaits approval')));
});

test('requestRetest rejects a report matching a claimed job by description', async () => {
  // 260101T0003-ret is the "Retest Fixture Page" report.
  const claimedPath = path.join(fixtureDBDir, 'jobs', 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, JSON.stringify({
    target: {what: 'Retest Fixture Page', url: 'https://example.com/unrelated'}
  }));
  try {
    const body = await response(['260101T0003', 'ret', 'A reason that is long enough.']);
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

test('requestRetest rejects a report matching a queued job by URL', async () => {
  // 260101T0003-ret's URL is https://example.com/retestfixture.
  const queuedPath = path.join(fixtureDBDir, 'jobs', 'queue', 'que.json');
  await fs.writeFile(queuedPath, JSON.stringify({
    target: {what: 'Some Other Page', url: 'https://example.com/retestfixture'}
  }));
  try {
    const body = await response(['260101T0003', 'ret', 'A reason that is long enough.']);
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

test('requestRetest rejects a duplicate request', async () => {
  await response(['260101T0003', 'ret', 'A reason that is long enough.']);
  const body = await response(['260101T0003', 'ret', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your request'] as any;
  assert.ok(disposition['what happens next'].includes('an identical request is already awaiting approval.'));
});

test('requestRetest accepts a valid retest request for the latest report of a page', async () => {
  const body = await response(['260202T0000', 'new', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  assert.equal(details['page to be retested'].description, 'Mixed Outcomes Page');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: new retest request awaits approval)')
    && line.includes('Mixed Outcomes Page')
    && line.includes('https://example.com/mixed')
    // The alert reports the resulting queue size, so a maintainer who has been away can
    // see at a glance how close the queue is to full.
    && line.includes('Requests now awaiting approval: 1 of 20')
  ));
});

test('requestRetest rejects a request with a fallback channel when the queue is full', async () => {
  // Fill testRequests.json with 20 pending requests, all for one URL, to reach the cap.
  const filler = Array.from({length: 20}, (_, i) => ({
    timeStamp: '260101T0000', description: `Filler Page ${i}`, reason: 'Filler reason.'
  }));
  await fs.writeFile(testRequestsPath, JSON.stringify({'https://example.com/filler': filler}));
  const body = await response(['260101T0003', 'ret', 'A reason that is long enough.']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your request'] as any;
  assert.ok(disposition['what happens next'].includes('too many requests are awaiting approval right now.'));
  assert.ok(disposition['what happens next'].includes('https://github.com/jrpool/kilotest/issues'));
  assert.ok(disposition['what happens next'].includes('info@kilotest.com'));
});
