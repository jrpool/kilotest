/*
  qaiTutorial.test.ts
  Unit tests for web/qaiTutorial/index.ts, covering the answer and handleComment exports.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {answer, handleComment} from './index.ts';

// CONSTANTS

const commentsPath = path.join(import.meta.dirname, 'comments.json');

// SETUP AND TEARDOWN

let originalComments: any;

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

test('answer returns the QAI tutorial page with status ok', async () => {
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
  await fs.writeFile(commentsPath, '[]\n');
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
  await fs.writeFile(commentsPath, '[]\n');
  const result = await handleComment('This is a <b>test</b> comment.');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'This is a test comment.');
  assert.ok(comments[0].dateTime);
});

test('handleComment strips HTML tags and control characters', {timeout: 500}, async () => {
  await fs.writeFile(commentsPath, '[]\n');
  const result = await handleComment('<img src=x onerror=alert(1)>\x00\x07Hello');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments[0].content, 'Hello');
});

test('handleComment accepts a comment of exactly 1000 characters', {timeout: 500}, async () => {
  await fs.writeFile(commentsPath, '[]\n');
  const maxComment = 'x'.repeat(1000);
  const result = await handleComment(maxComment);
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments[0].content.length, 1000);
});

test('handleComment creates comments.json when it does not exist', {timeout: 500}, async () => {
  await fs.unlink(commentsPath).catch(() => {});
  const result = await handleComment('Test comment for missing file');
  assert.equal(result.status, 'ok');
  const comments = JSON.parse(await fs.readFile(commentsPath, 'utf8'));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].content, 'Test comment for missing file');
});
