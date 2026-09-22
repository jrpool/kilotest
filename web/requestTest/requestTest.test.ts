/*
  requestTest.test.ts
  Unit tests for web/requestTest/index.ts, covering the success path of answer.
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

test('answer returns ok with a populated answer page for a valid test request', {timeout: 500}, async () => {
  // Require the module after DB_DIR is set.
  const {answer} = await import('./index.ts');
  const result: any = await answer(
    'Test Page', 'https://example.com/test-success', 'Because accessibility'
  );
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the placeholders were replaced.
  assert.ok(result.answerPage.includes('Test Page'));
  assert.ok(result.answerPage.includes('Because accessibility'));
  assert.ok(!result.answerPage.includes('__description__'));
  assert.ok(!result.answerPage.includes('__url__'));
  assert.ok(!result.answerPage.includes('__reason__'));
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('Test Page'));
});

test('answer returns an error when the URL is already queued', {timeout: 500}, async () => {
  const {answer} = await import('./index.ts');
  // Create a queued job with the target URL.
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  const jobPath = path.join(queueDir, 'queuedJob.json');
  await fs.writeFile(jobPath, JSON.stringify({
    id: 'queuedJob',
    target: {what: 'Queued Page', url: 'https://example.com/queued'}
  }));
  try {
    const result: any = await answer(
      'Queued Page', 'https://example.com/queued', 'Because accessibility'
    );
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'A request to test a page with the same description or URL is already approved');
  }
  finally {
    try {
      await fs.unlink(jobPath);
    }
    catch {
      // Ignore cleanup errors.
    }
  }
});

test('answer returns an error for a duplicate request', {timeout: 500}, async () => {
  const {answer} = await import('./index.ts');
  // Submit the same request twice; the second is a duplicate.
  await answer('Duplicate Page', 'https://example.com/duplicate', 'Because accessibility');
  const result: any = await answer(
    'Duplicate Page', 'https://example.com/duplicate', 'Because accessibility'
  );
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Test request duplicates an already submitted request');
});

test('answer returns an error when a report already exists for the page', {timeout: 500}, async () => {
  const {answer} = await import('./index.ts');
  // The fixture database already has a report for this description and URL.
  const result: any = await answer(
    'Mixed Outcomes Page', 'https://example.com/mixed', 'Because accessibility'
  );
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'A report about the page is already available');
});

test('answer returns an error with a fallback channel when the request queue is full', {timeout: 500}, async () => {
  const {answer} = await import('./index.ts');
  // Fill testRequests.json with 20 pending requests, all for one URL, to reach the cap.
  const filler = Array.from({length: 20}, (_, i) => ({
    timeStamp: '260101T0000', description: `Filler Page ${i}`, reason: 'Because filler'
  }));
  await fs.writeFile(testRequestsPath, JSON.stringify({'https://example.com/filler': filler}));
  const result: any = await answer(
    'One Too Many Page', 'https://example.com/one-too-many', 'Because accessibility'
  );
  assert.equal(result.status, 'error');
  assert.ok(result.message.startsWith('Too many requests are awaiting approval right now.'));
  assert.ok(result.message.includes('https://github.com/jrpool/kilotest/issues'));
  assert.ok(result.message.includes('info@kilotest.com'));
});
