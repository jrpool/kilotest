/*
  tutorial.test.cjs
  Unit tests for web/tutorial/index.ts, covering the answer and handleComment exports.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {answer, handleComment} = require('./index.ts');

// CONSTANTS

const commentsPath = path.join(__dirname, 'comments.json');

// SETUP AND TEARDOWN

let originalComments;

before(async () => {
  originalComments = await fs.readFile(commentsPath, 'utf8').catch(() => null);
});

after(async () => {
  if (originalComments !== null) {
    await fs.writeFile(commentsPath, originalComments);
  }
  else {
    await fs.unlink(commentsPath).catch(() => {});
  }
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
  const result = await handleComment('<script></script>');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Comment is empty after sanitization');
});

test('handleComment saves a sanitized comment and returns ok', {timeout: 500}, async () => {
  // Replace comments with an empty array for a clean test.
  await fs.writeFile(commentsPath, '[]\n');
  const result = await handleComment('This is a <b>test</b> comment.');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'This is a test comment.');
  assert.ok(comments[0].timeStamp);
});

test('handleComment strips HTML tags and control characters', {timeout: 500}, async () => {
  await fs.writeFile(commentsPath, '[]\n');
  const result = await handleComment('<img src=x onerror=alert(1)>\x00\x07Hello');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments[0].content, 'Hello');
});

test('handleComment truncates content to 500 characters', {timeout: 500}, async () => {
  await fs.writeFile(commentsPath, '[]\n');
  const longComment = 'x'.repeat(600);
  const result = await handleComment(longComment);
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments[0].content.length, 500);
});

test('handleComment creates comments.json when it does not exist', {timeout: 500}, async () => {
  await fs.unlink(commentsPath).catch(() => {});
  const result = await handleComment('Test comment for missing file');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'Test comment for missing file');
});
