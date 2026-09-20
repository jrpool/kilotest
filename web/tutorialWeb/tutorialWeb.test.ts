/*
  tutorial.test.ts
  Unit tests for web/tutorial/index.ts, covering the answer and handleComment exports.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// ENVIRONMENT

const testDir = path.join(import.meta.dirname, '../../test/fixtures/comments');
process.env.TUTORIAL_WEB_COMMENTS_PATH = path.join(testDir, 'tutorialWeb.json');
// Blank the alert configuration unconditionally, before index.ts (whose handleComment
// calls sendAlert for a new comment) is ever imported below, so this file sends no real
// alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

import {answer, handleComment} from './index.ts';

// CONSTANTS

const getCommentsPath = () => process.env.TUTORIAL_WEB_COMMENTS_PATH || path.join(import.meta.dirname, '../../db/comments/tutorialWeb.json');

// SETUP AND TEARDOWN

before(async () => {
  await fs.mkdir(testDir, {recursive: true});
  await fs.writeFile(getCommentsPath(), '[]\n');
});

after(async () => {
  // Cleanup is handled by index.test.ts since multiple test files use this shared directory.
});

// TESTS

test('answer returns the tutorial page with status ok', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  assert.ok(result.answerPage.length > 0);
});

test('handleComment returns an error for empty content', async () => {
  const result = await handleComment('');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'No content provided');
});

test('handleComment returns an error for non-string content', async () => {
  const result = await handleComment(null);
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'No content provided');
});

test('handleComment returns an error for content that is empty after sanitization', async () => {
  // Padded with spaces (stripped by sanitize's trim) to clear the 20-character length check
  // on the raw content, isolating the empty-after-sanitization path from the length check.
  const result = await handleComment(`${' '.repeat(10)}<script></script>${' '.repeat(10)}`);
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Comment is empty after sanitization');
});

test('handleComment returns an error for a comment shorter than 20 characters', async () => {
  const result = await handleComment('short');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Your comment was shorter than 20 characters');
});

test('handleComment returns an error for a comment longer than 1000 characters', async () => {
  const result = await handleComment('x'.repeat(1001));
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Your comment was longer than 1000 characters');
});

test('handleComment returns an error for a comment repeating one submitted within the last 1000 seconds', {timeout: 500}, async () => {
  await fs.writeFile(getCommentsPath(), '[]\n');
  const content = 'This is a duplicate comment.';
  const firstResult = await handleComment(content);
  assert.equal(firstResult.status, 'ok');
  const secondResult = await handleComment(content);
  assert.equal(secondResult.status, 'error');
  assert.equal(
    secondResult.message,
    'Your comment repeats a recently submitted one, but you are welcome to submit a different comment'
  );
});

test('handleComment saves a sanitized comment and returns ok', {timeout: 500}, async () => {
  // Replace comments with an empty array for a clean test.
  await fs.writeFile(getCommentsPath(), '[]\n');
  const result = await handleComment('This is a <b>test</b> comment.');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(getCommentsPath(), 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'This is a test comment.');
  assert.ok(comments[0].timeStamp);
});

test('handleComment strips HTML tags and control characters', {timeout: 500}, async () => {
  await fs.writeFile(getCommentsPath(), '[]\n');
  const result = await handleComment('<img src=x onerror=alert(1)>\x00\x07Hello');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(getCommentsPath(), 'utf8'));
  assert.equal(comments[0].content, 'Hello');
});

test('handleComment accepts a comment of exactly 1000 characters', {timeout: 500}, async () => {
  await fs.writeFile(getCommentsPath(), '[]\n');
  const maxComment = 'x'.repeat(1000);
  const result = await handleComment(maxComment);
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(getCommentsPath(), 'utf8'));
  assert.equal(comments[0].content.length, 1000);
});

test('handleComment creates comments.json when it does not exist', {timeout: 500}, async () => {
  await fs.unlink(getCommentsPath()).catch(() => {});
  const result = await handleComment('Test comment for missing file');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(getCommentsPath(), 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'Test comment for missing file');
});

test('handleComment creates the comments directory when it does not exist', {timeout: 500}, async () => {
  const savedEnv = process.env.TUTORIAL_WEB_COMMENTS_PATH;
  const missingDirPath = path.join(testDir, 'new-subdir', 'tutorialWeb.json');
  process.env.TUTORIAL_WEB_COMMENTS_PATH = missingDirPath;
  try {
    const result = await handleComment('Test comment for missing directory');
    assert.equal(result.status, 'ok');
    const comments = JSON.parse(await fs.readFile(missingDirPath, 'utf8'));
    assert.equal(comments[0].content, 'Test comment for missing directory');
  } finally {
    process.env.TUTORIAL_WEB_COMMENTS_PATH = savedEnv;
    await fs.rm(path.dirname(missingDirPath), {recursive: true, force: true});
  }
});

test('getCommentsPath uses environment variable when set', {timeout: 500}, async () => {
  const envValue = process.env.TUTORIAL_WEB_COMMENTS_PATH;
  assert.ok(envValue);
  assert.ok(getCommentsPath().includes('test/fixtures/comments'));
});

test('getCommentsPath falls back to default path when environment variable is not set', {timeout: 500}, async () => {
  const savedEnv = process.env.TUTORIAL_WEB_COMMENTS_PATH;
  delete process.env.TUTORIAL_WEB_COMMENTS_PATH;
  try {
    const path = getCommentsPath();
    assert.ok(path.includes('db/comments'));
    assert.ok(path.includes('tutorialWeb.json'));
  } finally {
    process.env.TUTORIAL_WEB_COMMENTS_PATH = savedEnv;
  }
});

test('handleComment uses fallback path when environment variable is not set', {timeout: 500}, async () => {
  const savedEnv = process.env.TUTORIAL_WEB_COMMENTS_PATH;
  const defaultPath = path.join(import.meta.dirname, '../../db/comments/tutorialWeb.json');
  const backupPath = defaultPath + '.backup';

  // Backup the default comments file if it exists.
  let hadDefault = false;
  try {
    const content = await fs.readFile(defaultPath, 'utf8');
    await fs.writeFile(backupPath, content);
    hadDefault = true;
  } catch {
    // File doesn't exist, that's fine.
  }

  delete process.env.TUTORIAL_WEB_COMMENTS_PATH;
  try {
    // Write a test file to the default location.
    await fs.mkdir(path.dirname(defaultPath), {recursive: true});
    await fs.writeFile(defaultPath, '[]\n');
    const result = await handleComment('Test with fallback path');
    assert.equal(result.status, 'ok');
    const comments = JSON.parse(await fs.readFile(defaultPath, 'utf8'));
    assert.equal(comments.length, 1);
    assert.equal(comments[0].content, 'Test with fallback path');
  } finally {
    // Restore the original state.
    if (hadDefault) {
      const backup = await fs.readFile(backupPath, 'utf8');
      await fs.writeFile(defaultPath, backup);
      await fs.unlink(backupPath);
    } else {
      await fs.unlink(defaultPath).catch(() => {});
    }
    process.env.TUTORIAL_WEB_COMMENTS_PATH = savedEnv;
  }
});
