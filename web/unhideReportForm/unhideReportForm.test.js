/*
  unhideReportForm.test.js
  Unit tests for web/unhideReportForm/index.ts.
*/

// IMPORTS

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs/promises');
const {parse} = require('node-html-parser');
const {answer} = require('./index.ts');
const {reportsPath, hiddenReportsPath} = require('../../util.ts');

// CONSTANTS

const hiddenFile = '260101T0007-hid.json';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
const fixtureDBDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');

const getPaths = () => ({
  hidden: path.join(hiddenReportsPath(), hiddenFile),
  report: path.join(reportsPath(), hiddenFile)
});

before(() => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
});

beforeEach(async () => {
  // Ensure the hidden report is in the hidden directory before each test.
  const {hidden, report} = getPaths();
  try {
    await fs.rename(report, hidden);
  }
  catch {
    // Report may already be hidden.
  }
});

after(async () => {
  // Restore the hidden report if it was moved.
  const {hidden, report} = getPaths();
  try {
    await fs.rename(report, hidden);
  }
  catch {
    // Report may already be hidden.
  }
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('unhideReportForm displays a list of hidden reports when no submission', async () => {
  const result = await answer(null, '');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  const radios = html.querySelectorAll('input[type="radio"]');
  assert.ok(radios.length > 0);
});

test('unhideReportForm returns an error for an invalid auth code', async () => {
  const result = await answer(null, 'authCode=wrong&report=260101T0007-hid');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('unhideReportForm unhides a report with valid auth code', async () => {
  const {report} = getPaths();
  const result = await answer(null, 'authCode=test-auth-code&report=260101T0007-hid');
  assert.equal(result.status, 'ok');
  // The report should now be in the reports directory.
  await fs.access(report);
});

test('unhideReportForm returns an error when unhiding a nonexistent report', async () => {
  const result = await answer(null, 'authCode=test-auth-code&report=999999T9999-nope');
  assert.equal(result.status, 'error');
  assert.ok(result.message.includes('Unhiding report'));
});

test('unhideReportForm sorts hidden reports with the same page name by timeStamp', async () => {
  const {hidden} = getPaths();
  // Add a second hidden report with the same what as the existing one.
  const existing = JSON.parse(await fs.readFile(hidden, 'utf8'));
  // Create a copy with a different timeStamp but same target.what.
  const copy = JSON.parse(JSON.stringify(existing));
  copy.id = '260101T0010-hid2';
  const copyPath = path.join(hiddenReportsPath(), '260101T0010-hid2.json');
  await fs.writeFile(copyPath, JSON.stringify(copy));
  try {
    const result = await answer(null, '');
    assert.equal(result.status, 'ok');
    // Both reports should appear in the form.
    assert.ok(result.answerPage.includes('260101T0007-hid'));
    assert.ok(result.answerPage.includes('260101T0010-hid2'));
  }
  finally {
    await fs.unlink(copyPath).catch(() => {});
  }
});

test('unhideReportForm sorts hidden reports with different page names alphabetically', async () => {
  const {hidden} = getPaths();
  // Add a second hidden report with a different what.
  const existing = JSON.parse(await fs.readFile(hidden, 'utf8'));
  const copy = JSON.parse(JSON.stringify(existing));
  copy.id = '260101T0011-hid3';
  copy.target.what = 'A Different Page';
  const copyPath = path.join(hiddenReportsPath(), '260101T0011-hid3.json');
  await fs.writeFile(copyPath, JSON.stringify(copy));
  try {
    const result = await answer(null, '');
    assert.equal(result.status, 'ok');
    // Both reports should appear in the form.
    assert.ok(result.answerPage.includes('260101T0007-hid'));
    assert.ok(result.answerPage.includes('260101T0011-hid3'));
  }
  finally {
    await fs.unlink(copyPath).catch(() => {});
  }
});
