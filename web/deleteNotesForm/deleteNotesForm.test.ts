/*
  deleteNotesForm.test.ts
  Unit tests for web/deleteNotesForm/index.ts.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// ENVIRONMENT

const testDir = path.join(import.meta.dirname, '../../test/fixtures/deleteNotesForm');
const tutorialWebPath = path.join(testDir, 'tutorialWeb.json');
const tutorialAIPath = path.join(testDir, 'tutorialAI.json');
const featureRequestsPath = path.join(testDir, 'featureRequests.json');

const savedAuthCode = process.env.AUTH_CODE;
const savedTutorialWebPath = process.env.TUTORIAL_WEB_COMMENTS_PATH;
const savedTutorialAIPath = process.env.TUTORIAL_AI_COMMENTS_PATH;
const savedFeatureRequestsPath = process.env.FEATURE_REQUESTS_PATH;

before(async () => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.TUTORIAL_WEB_COMMENTS_PATH = tutorialWebPath;
  process.env.TUTORIAL_AI_COMMENTS_PATH = tutorialAIPath;
  process.env.FEATURE_REQUESTS_PATH = featureRequestsPath;
  await fs.mkdir(testDir, {recursive: true});
});

beforeEach(async () => {
  await fs.writeFile(tutorialWebPath, JSON.stringify([
    {timeStamp: '260101T0000', content: 'A web tutorial comment'}
  ]));
  await fs.writeFile(tutorialAIPath, JSON.stringify([
    {timeStamp: '260102T0000', content: 'An AI tutorial comment'}
  ]));
  await fs.writeFile(featureRequestsPath, JSON.stringify([
    {timeStamp: '260103T0000', content: 'A feature request'}
  ]));
});

import {answer} from './index.ts';

after(async () => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedTutorialWebPath !== undefined) {
    process.env.TUTORIAL_WEB_COMMENTS_PATH = savedTutorialWebPath;
  } else {
    delete process.env.TUTORIAL_WEB_COMMENTS_PATH;
  }
  if (savedTutorialAIPath !== undefined) {
    process.env.TUTORIAL_AI_COMMENTS_PATH = savedTutorialAIPath;
  } else {
    delete process.env.TUTORIAL_AI_COMMENTS_PATH;
  }
  if (savedFeatureRequestsPath !== undefined) {
    process.env.FEATURE_REQUESTS_PATH = savedFeatureRequestsPath;
  } else {
    delete process.env.FEATURE_REQUESTS_PATH;
  }
  await fs.rm(testDir, {recursive: true, force: true});
});

// TESTS

test('deleteNotesForm lists notes from all three sources on a GET request', async () => {
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage!.includes('A web tutorial comment'));
  assert.ok(result.answerPage!.includes('An AI tutorial comment'));
  assert.ok(result.answerPage!.includes('A feature request'));
});

test('deleteNotesForm ignores a note query string on a GET request', async () => {
  const result = await answer(
    null,
    `authCode=test-auth-code&note=tutorialWeb%09${encodeURIComponent('A web tutorial comment')}`,
    'GET'
  );
  assert.equal(result.status, 'ok');
  // The note should NOT have been deleted by a mere GET request.
  const notes = JSON.parse(await fs.readFile(tutorialWebPath, 'utf8'));
  assert.equal(notes.length, 1);
});

test('deleteNotesForm returns an error for an invalid auth code on a POST request', async () => {
  const result = await answer(
    null,
    `authCode=wrong&note=tutorialWeb%09${encodeURIComponent('A web tutorial comment')}`,
    'POST'
  );
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid request');
  const notes = JSON.parse(await fs.readFile(tutorialWebPath, 'utf8'));
  assert.equal(notes.length, 1);
});

test('deleteNotesForm deletes a selected web tutorial comment with a valid auth code', async () => {
  const result = await answer(
    null,
    `authCode=test-auth-code&note=tutorialWeb%09${encodeURIComponent('A web tutorial comment')}`,
    'POST'
  );
  assert.equal(result.status, 'ok');
  const notes = JSON.parse(await fs.readFile(tutorialWebPath, 'utf8'));
  assert.equal(notes.length, 0);
  // The other sources are untouched.
  const aiNotes = JSON.parse(await fs.readFile(tutorialAIPath, 'utf8'));
  assert.equal(aiNotes.length, 1);
});

test('deleteNotesForm deletes selected notes across multiple sources in one submission', async () => {
  const result = await answer(
    null,
    'authCode=test-auth-code' +
      `&note=tutorialWeb%09${encodeURIComponent('A web tutorial comment')}` +
      `&note=tutorialAI%09${encodeURIComponent('An AI tutorial comment')}` +
      `&note=featureRequest%09${encodeURIComponent('A feature request')}`,
    'POST'
  );
  assert.equal(result.status, 'ok');
  assert.equal(JSON.parse(await fs.readFile(tutorialWebPath, 'utf8')).length, 0);
  assert.equal(JSON.parse(await fs.readFile(tutorialAIPath, 'utf8')).length, 0);
  assert.equal(JSON.parse(await fs.readFile(featureRequestsPath, 'utf8')).length, 0);
});

test('deleteNotesForm leaves unselected notes in a source intact', async () => {
  await fs.writeFile(tutorialWebPath, JSON.stringify([
    {timeStamp: '260101T0000', content: 'Keep this one'},
    {timeStamp: '260101T0001', content: 'Delete this one'}
  ]));
  const result = await answer(
    null,
    `authCode=test-auth-code&note=tutorialWeb%09${encodeURIComponent('Delete this one')}`,
    'POST'
  );
  assert.equal(result.status, 'ok');
  const notes = JSON.parse(await fs.readFile(tutorialWebPath, 'utf8'));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].content, 'Keep this one');
});

test('deleteNotesForm reports no notes to delete when all sources are empty', async () => {
  await fs.writeFile(tutorialWebPath, '[]');
  await fs.writeFile(tutorialAIPath, '[]');
  await fs.writeFile(featureRequestsPath, '[]');
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage!.includes('There are no comments or feature requests to delete.'));
});

test('deleteNotesForm treats a missing source file as having no notes', async () => {
  await fs.rm(featureRequestsPath, {force: true});
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage!.includes('A web tutorial comment'));
});

test('deleteNotesForm escapes note content to prevent HTML injection', async () => {
  await fs.writeFile(tutorialWebPath, JSON.stringify([
    {timeStamp: '260101T0000', content: '<script>alert(1)</script>'}
  ]));
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(!result.answerPage!.includes('<script>'));
});

test('deleteNotesForm deletes a note whose content contains a literal tab character', async () => {
  const content = 'Line one\tLine two, after an embedded tab';
  await fs.writeFile(tutorialWebPath, JSON.stringify([
    {timeStamp: '260101T0000', content}
  ]));
  const result = await answer(
    null, `authCode=test-auth-code&note=tutorialWeb%09${encodeURIComponent(content)}`, 'POST'
  );
  assert.equal(result.status, 'ok');
  const notes = JSON.parse(await fs.readFile(tutorialWebPath, 'utf8'));
  assert.equal(notes.length, 0);
});

test('deleteNotesForm renders a checkbox value that round-trips a note with a literal tab', async () => {
  const content = 'Has\ta\ttab';
  await fs.writeFile(tutorialWebPath, JSON.stringify([
    {timeStamp: '260101T0000', content}
  ]));
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage!.includes(`tutorialWeb\t${encodeURIComponent(content)}`));
});

test('deleteNotesForm returns an error when a note file cannot be written', async () => {
  // Point the web tutorial comments path at a location whose parent is a file, so that
  // creating the directory for it fails.
  const blockerFile = path.join(testDir, 'blocker');
  const unwritablePath = path.join(blockerFile, 'tutorialWeb.json');
  await fs.writeFile(blockerFile, 'not a directory');
  const savedPath = process.env.TUTORIAL_WEB_COMMENTS_PATH;
  process.env.TUTORIAL_WEB_COMMENTS_PATH = unwritablePath;
  try {
    const result = await answer(
      null,
      `authCode=test-auth-code&note=tutorialWeb%09${encodeURIComponent('A web tutorial comment')}`,
      'POST'
    );
    assert.equal(result.status, 'error');
    assert.ok(result.message?.includes('Deleting notes failed'));
  } finally {
    process.env.TUTORIAL_WEB_COMMENTS_PATH = savedPath;
    await fs.unlink(blockerFile).catch(() => {});
  }
});

test('deleteNotesForm falls back to default paths when environment variables are not set', async () => {
  const saved = {
    tutorialWeb: process.env.TUTORIAL_WEB_COMMENTS_PATH,
    tutorialAI: process.env.TUTORIAL_AI_COMMENTS_PATH,
    featureRequest: process.env.FEATURE_REQUESTS_PATH
  };
  delete process.env.TUTORIAL_WEB_COMMENTS_PATH;
  delete process.env.TUTORIAL_AI_COMMENTS_PATH;
  delete process.env.FEATURE_REQUESTS_PATH;
  try {
    // None of the default db/ files exist in this environment, so the form should
    // still render, treating each missing source as having no notes.
    const result = await answer(null, '', 'GET');
    assert.equal(result.status, 'ok');
  } finally {
    process.env.TUTORIAL_WEB_COMMENTS_PATH = saved.tutorialWeb;
    process.env.TUTORIAL_AI_COMMENTS_PATH = saved.tutorialAI;
    process.env.FEATURE_REQUESTS_PATH = saved.featureRequest;
  }
});
