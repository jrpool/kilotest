/*
  rewindReportsForm.test.js
  Unit tests for web/rewindReportsForm/index.js.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs/promises');
const {parse} = require('node-html-parser');
const {answer} = require('./index');
const {reportsPath} = require('../../util');

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
const fixtureDBDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');

before(() => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
});

after(async () => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('rewindReportsForm displays a list of reports when no submission', async () => {
  const result = await answer(null, '');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('rewindReportsForm returns an error for an invalid auth code', async () => {
  const result = await answer(null, 'authCode=wrong&report=260202T0000-new');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('rewindReportsForm returns an error when deleting a nonexistent report', async () => {
  const result = await answer(null, 'authCode=test-auth-code&report=999999T9999-nope');
  assert.equal(result.status, 'error');
  assert.ok(result.message.includes('Deleting latest superseding reports'));
});

test('rewindReportsForm deletes a latest superseding report with valid auth code', async () => {
  // 260202T0000-new is the latest report for its URL, superseding 260101T0000-mix.
  const reportPath = path.join(reportsPath(), '260202T0000-new.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const result = await answer(null, 'authCode=test-auth-code&report=260202T0000-new');
    assert.equal(result.status, 'ok');
    await fs.access(reportPath).then(
      () => {throw new Error('Report should have been deleted');},
      () => {}
    );
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('rewindReportsForm returns an error when a report file is corrupt', async () => {
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    await fs.writeFile(reportPath, 'not valid json');
    const result = await answer(null, '');
    assert.equal(result.status, 'error');
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});
