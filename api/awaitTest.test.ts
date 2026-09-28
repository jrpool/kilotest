/*
  awaitTest.test.ts
  Tests for api/awaitTest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';

for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
// Keep the poll fast in this file, since these tests do not exercise timing edge cases
// (those live in util.test.ts, closer to awaitJob itself); a short interval just keeps
// this file's own tests quick.
process.env.AWAIT_JOB_POLL_MS = '10';
process.env.AWAIT_JOB_TIMEOUT_MS = '50';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

import {response} from './awaitTest.ts';

after(() => {
  delete process.env.AWAIT_JOB_POLL_MS;
  delete process.env.AWAIT_JOB_TIMEOUT_MS;
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('awaitTest rejects a malformed timestamp or job identifier', async () => {
  const body = await response(['999999T9999', 'xyz']);
  const details = body['response content']['details about your wait'] as any;
  assert.ok(details.error.includes('malformed'));
  assert.equal(body['response content']['disposition of your wait'], null);
});

test('awaitTest returns "completed" for an identifier with an already-available report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const details = body['response content']['details about your wait'] as any;
  assert.deepEqual(details['report identifier'], {timeStamp: '260101T0000', jobID: 'mix'});
  const disposition = body['response content']['disposition of your wait'] as any;
  assert.equal(disposition.outcome, 'completed');
  assert.ok(disposition['how you can check for completion'].includes('listIssues'));
});

test('awaitTest returns an error for an identifier naming neither a report nor a pending job', async () => {
  const body = await response(['260101T0000', 'zzz']);
  const details = body['response content']['details about your wait'] as any;
  assert.ok(details.error.includes('no report'));
  assert.equal(body['response content']['disposition of your wait'], null);
});

test('awaitTest returns "failed" when the job has moved to the failed directory', async () => {
  const failedPath = path.join(fixtureDBDir, 'jobs', 'failed', '260101T4444-flj.json');
  await fs.mkdir(path.dirname(failedPath), {recursive: true});
  await fs.writeFile(failedPath, JSON.stringify({target: {what: 'Failed Page', url: 'https://example.com/failed'}}));
  try {
    const body = await response(['260101T4444', 'flj']);
    const disposition = body['response content']['disposition of your wait'] as any;
    assert.equal(disposition.outcome, 'failed');
    assert.equal(disposition['how you can check for completion'], 'Not applicable.');
  }
  finally {
    await fs.unlink(failedPath);
  }
});

test('awaitTest returns "timedOut" when a claimed job neither completes nor fails before the deadline', async () => {
  const claimedPath = path.join(fixtureDBDir, 'jobs', 'claimed', '260101T5555-toj.json');
  await fs.writeFile(claimedPath, JSON.stringify({target: {what: 'Stuck Page', url: 'https://example.com/stuck'}}));
  try {
    const body = await response(['260101T5555', 'toj']);
    const disposition = body['response content']['disposition of your wait'] as any;
    assert.equal(disposition.outcome, 'timedOut');
    assert.ok(disposition['how you can check for completion'].includes('listIssues'));
  }
  finally {
    await fs.unlink(claimedPath);
  }
});

test('awaitTest response has no web UI equivalents for this request or its ancestors', async () => {
  const body = await response(['260101T0000', 'mix']);
  const similarWeb = body['URLs of similar requests for web users'] as any;
  assert.equal(similarWeb['this request'], null);
  assert.equal(similarWeb['closest ancestor request'], null);
});

test('awaitTest reports both orderNewTest and orderRetest as possible ancestors', async () => {
  const body = await response(['260101T0000', 'mix']);
  const ancestors = (body['this request'] as any)['closest ancestor request'];
  assert.equal(ancestors.length, 2);
  const names = ancestors.map((a: any) => a['tool name']).sort();
  assert.deepEqual(names, ['orderNewTest', 'orderRetest']);
  for (const ancestor of ancestors) {
    assert.equal(ancestor.method, 'POST');
  }
});
