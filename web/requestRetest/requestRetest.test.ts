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
const testRequestsPath = path.join(fixtureDBDir, 'jobs', 'testRequests.json');

// SETUP AND TEARDOWN

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  process.env.AUTH_CODE = 'test-auth-code';
});

beforeEach(async () => {
  // Reset testRequests.json and clean job directories before each test.
  await fs.writeFile(testRequestsPath, '{}\n');
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
  // Restore testRequests.json and clean job directories after all tests.
  await fs.writeFile(testRequestsPath, '{}\n');
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
  const result: any = await answer('260101T0001/ct', 'Because changes were made');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the description and reason placeholders were replaced with the report target.
  // (Note: the template's <title> uses __target__, a placeholder query never supplies;
  // that pre-existing template mismatch is out of scope here and left unasserted.)
  assert.ok(result.answerPage.includes('All CantTell Page'));
  assert.ok(result.answerPage.includes('Because changes were made'));
  assert.ok(!result.answerPage.includes('__description__'));
  assert.ok(!result.answerPage.includes('__url__'));
  assert.ok(!result.answerPage.includes('__reason__'));
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('All CantTell Page'));
});

test('answer returns an error when the report does not exist', async () => {
  const {answer} = await import('./index.ts');
  // Use a nonexistent report timestamp and jobID.
  const result: any = await answer('990101T0000/xxx', 'Because changes were made');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid request');
});

test('answer returns an error for a duplicate retest request', async () => {
  const {answer} = await import('./index.ts');
  // Submit the same retest request twice; the second is a duplicate.
  await answer('260101T0001/ct', 'Because changes were made');
  const result: any = await answer('260101T0001/ct', 'Because changes were made');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Test request duplicates an already submitted request');
});

test('answer returns an error when the cited report has been superseded', async () => {
  const {answer} = await import('./index.ts');
  // 260101T0000-mix (Mixed Outcomes Page) is superseded by 260202T0000-new.
  const result: any = await answer('260101T0000/mix', 'Because changes were made');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'A later report about the page is already available');
});

test('answer returns an error when a matching job is already claimed or queued', async () => {
  const {answer} = await import('./index.ts');
  // Create a claimed job sharing the description of the cited report
  // (260101T0001-ct, "All CantTell Page").
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const jobPath = path.join(claimedDir, 'claimedJob.json');
  await fs.writeFile(jobPath, JSON.stringify({
    id: 'claimedJob',
    target: {what: 'All CantTell Page', url: 'https://example.com/unrelated'}
  }));
  try {
    const result: any = await answer('260101T0001/ct', 'Because changes were made');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'A request to test a page with the same description or URL is already approved');
  }
  finally {
    await fs.unlink(jobPath).catch(() => {});
  }
});

