// Not yet under strict type checking (transitional).
// @ts-nocheck
/*
  requestRetest.test.ts
  Unit tests for web/requestRetest/index.ts, covering the success path of answer.
*/

// IMPORTS

import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'node-html-parser';

// CONSTANTS

import {fixtureDBDir} from '../../test/dbFixture.ts';
const recsPath = path.join(fixtureDBDir, 'jobs', 'recs.json');

// SETUP AND TEARDOWN

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  process.env.AUTH_CODE = 'test-auth-code';
});

beforeEach(async () => {
  // Reset recs.json and clean job directories before each test.
  await fs.writeFile(recsPath, '{}\n');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(fixtureDBDir, 'jobs', sub);
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      try {
        await fs.unlink(path.join(dir, file));
      }
      catch {
        // Ignore cleanup errors for files that may not exist.
      }
    }
  }
});

after(async () => {
  // Restore recs.json and clean job directories after all tests.
  await fs.writeFile(recsPath, '{}\n');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(fixtureDBDir, 'jobs', sub);
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      try {
        await fs.unlink(path.join(dir, file));
      }
      catch {
        // Ignore cleanup errors for files that may not exist.
      }
    }
  }
});

// TESTS

test('answer returns ok with a populated answer page for a valid retest request', async () => {
  // Require the module after DB_DIR is set.
  const {answer} = await import('./index.ts');
  // Use the 260101T0001-ct report (All CantTell Page, https://example.com/canttell).
  const result = await answer('260101T0001/ct', 'Because changes were made');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the placeholders were replaced with the report target.
  assert.ok(result.answerPage.includes('All CantTell Page'));
  assert.ok(result.answerPage.includes('Because changes were made'));
  assert.ok(!result.answerPage.includes('__target__'));
  assert.ok(!result.answerPage.includes('__why__'));
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('All CantTell Page'));
});

test('answer throws when the report does not exist', async () => {
  const {answer} = await import('./index.ts');
  // Use a nonexistent report timestamp and jobID.
  await assert.rejects(
    () => answer('990101T0000/xxx', 'Because changes were made'),
    /Cannot destructure property 'error'/
  );
});

test('answer returns an error for an invalid retest recommendation', async () => {
  const {answer} = await import('./index.ts');
  // Use a valid report but a too-short reason.
  const result = await answer('260101T0001/ct', 'why');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('answer returns an error when the report extract has an error', async (t) => {
  // Mock getReportExtracts to return an extract with an error, delegating other exports.
  const realUtil = await import('../../util.ts');
  t.mock.module('../../util.ts', {
    exports: {
      ...realUtil,
      getReportExtracts: async () => [
        {timeStamp: '260101T0001', jobID: 'ct', error: 'Report data unavailable'}
      ]
    }
  });
  // Import a fresh instance of index.ts so it binds to the mocked module.
  // The query string makes the specifier unique, bypassing the module cache.
  const {answer} = await import('./index.ts?mockExtractError');
  const result = await answer('260101T0001/ct', 'Because changes were made');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Report data unavailable');
});
