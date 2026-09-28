/*
  orderRetest.test.ts
  Tests for api/orderRetest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';

for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const queuePath = path.join(fixtureDBDir, 'jobs', 'queue');
// A report added only to this test's disposable copy of the fixture database (never to
// the tracked test/fixtures/db corpus), matching the fixture requestRetest.test.ts uses
// for the same reason: a 3-character job ID satisfying isJobID without perturbing
// report-count tests elsewhere that copy the whole corpus.
const retestFixturePath = path.join(fixtureDBDir, 'reports', '260101T0004-ord.json');
const retestFixtureReport = {
  id: '260101T0004-ord',
  what: 'Order Retest Fixture Page',
  target: {what: 'Order Retest Fixture Page', url: 'https://example.com/orderretestfixture'},
  sources: {worker: 'test-worker'},
  acts: [],
  jobData: {startTime: '26-01-01T00:00', endTime: '26-01-01T00:10', elapsedSeconds: 600, preventions: {}, issuelessRules: []},
  catalog: {},
  images: {},
  checkpoints: []
};

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  await fs.writeFile(retestFixturePath, JSON.stringify(retestFixtureReport));
});

beforeEach(async () => {
  for (const fileName of await fs.readdir(queuePath)) {
    await fs.unlink(path.join(queuePath, fileName));
  }
});

import {response} from './orderRetest.ts';

after(async () => {
  await fs.unlink(retestFixturePath);
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('orderRetest rejects a nonexistent report', async () => {
  const body = await response(['251231T0000', 'zzz', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('does not exist'));
});

test('orderRetest rejects a malformed timestamp or job identifier', async () => {
  const body = await response(['999999T9999', 'xyz', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('malformed'));
});

test('orderRetest rejects a reason shorter than 20 characters', async () => {
  const body = await response(['260101T0004', 'ord', 'short']);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('reason'));
});

test('orderRetest rejects a reason longer than 100 characters', async () => {
  const longReason = 'x'.repeat(101);
  const body = await response(['260101T0004', 'ord', longReason]);
  const details = body['response content']['details about your order'] as any;
  assert.ok(details.error.includes('reason'));
});

test('orderRetest rejects a superseded report', async () => {
  // 260101T0000-mix is an earlier report of "Mixed Outcomes Page" than 260202T0000-new,
  // so it is superseded.
  const body = await response(['260101T0000', 'mix', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.equal(details.error, undefined);
  const disposition = body['response content']['disposition of your order'] as any;
  assert.ok(
    disposition['what happens next'].includes('a later report about a page with the same description is available.')
  );
  assert.equal(disposition['report identifier'], null);
});

test('orderRetest rejects a report matching a claimed job by description', async () => {
  const claimedPath = path.join(fixtureDBDir, 'jobs', 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, JSON.stringify({
    target: {what: 'Order Retest Fixture Page', url: 'https://example.com/unrelated'}
  }));
  try {
    const body = await response(['260101T0004', 'ord', 'A reason that is long enough.']);
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

test('orderRetest rejects a report matching a queued job by URL', async () => {
  const queuedFilePath = path.join(queuePath, 'que.json');
  await fs.writeFile(queuedFilePath, JSON.stringify({
    target: {what: 'Some Other Page', url: 'https://example.com/orderretestfixture'}
  }));
  try {
    const body = await response(['260101T0004', 'ord', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your order'] as any;
    assert.ok(
      disposition['what happens next']
      .includes('a request to test a page with the same URL is already approved.')
    );
  }
  finally {
    await fs.unlink(queuedFilePath);
  }
});

test('orderRetest rejects an order once the job queue is full', async () => {
  const fillerPath = path.join(queuePath, 'fil.json');
  await fs.writeFile(fillerPath, JSON.stringify({target: {what: 'Filler', url: 'https://example.com/filler'}}));
  process.env.JOB_QUEUE_MAX = '1';
  try {
    const body = await response(['260101T0004', 'ord', 'A reason that is long enough.']);
    const details = body['response content']['details about your order'] as any;
    assert.equal(details.error, undefined);
    const disposition = body['response content']['disposition of your order'] as any;
    assert.ok(disposition['what happens next'].includes('too many requests are awaiting approval right now.'));
  } finally {
    delete process.env.JOB_QUEUE_MAX;
    await fs.unlink(fillerPath);
  }
});

test('orderRetest accepts a valid retest order and enqueues a job directly', async () => {
  const body = await response(['260101T0004', 'ord', 'A reason that is long enough.']);
  const details = body['response content']['details about your order'] as any;
  assert.equal(details.error, undefined);
  assert.equal(details['page to be retested'].description, 'Order Retest Fixture Page');
  const disposition = body['response content']['disposition of your order'] as any;
  assert.ok(disposition['report identifier']);
  assert.ok(disposition['what happens next'].includes('Testing has begun.'));
  assert.ok(disposition['do you want to wait for completion'].includes('awaitTest'));
  const queuedFiles = await fs.readdir(queuePath);
  assert.equal(queuedFiles.length, 1);
  const job = JSON.parse(await fs.readFile(path.join(queuePath, queuedFiles[0]!), 'utf8'));
  assert.equal(job.target.what, 'Order Retest Fixture Page');
  assert.equal(job.sources.reason, 'A reason that is long enough.');
});

test('orderRetest response omits a web UI URL for this request but includes the ancestor', async () => {
  const body = await response(['260101T0004', 'ord', 'A reason that is long enough.']);
  const similarWeb = body['URLs of similar requests for web users'] as any;
  assert.equal(similarWeb['this request'], null);
  assert.ok(similarWeb['closest ancestor request'].includes('listIssues.html'));
});
