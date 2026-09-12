/*
  requestTest.test.cjs
  Unit tests for web/requestTest/index.ts, covering the success path of answer.
*/

// IMPORTS

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {parse} = require('node-html-parser');

// CONSTANTS

const fixtureDBDir = require('../../test/dbFixture.cjs').fixtureDBDir;
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

test('answer returns ok with a populated answer page for a valid test request', {timeout: 500}, async () => {
  // Require the module after DB_DIR is set.
  const {answer} = require('./index.cts');
  const result = await answer(
    'Test Page', 'https://example.com/test-success', 'Because accessibility'
  );
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the placeholders were replaced.
  assert.ok(result.answerPage.includes('Test Page'));
  assert.ok(result.answerPage.includes('Because accessibility'));
  assert.ok(!result.answerPage.includes('__target__'));
  assert.ok(!result.answerPage.includes('__why__'));
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('Test Page'));
});

test('answer returns an error when the URL is already queued', {timeout: 500}, async () => {
  const {answer} = require('./index.cts');
  // Create a queued job with the target URL.
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  const jobPath = path.join(queueDir, 'queuedJob.json');
  await fs.writeFile(jobPath, JSON.stringify({
    id: 'queuedJob',
    target: {what: 'Queued Page', url: 'https://example.com/queued'}
  }));
  try {
    const result = await answer(
      'Queued Page', 'https://example.com/queued', 'Because accessibility'
    );
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('queued'));
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

test('answer returns an error for an invalid recommendation', {timeout: 500}, async () => {
  const {answer} = require('./index.cts');
  const result = await answer('', 'not-a-url', 'why');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});
