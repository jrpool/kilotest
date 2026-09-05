/*
  listViolators.test.js
  UI tests for web/listViolators/index.js using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {parse} = require('node-html-parser');
const {answer} = require('./index');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
});

after(() => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('listViolators returns an ok status with valid HTML for linkNoText in the mixed report', async () => {
  const result = await answer('linkNoText/260101T0000/mix');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('listViolators includes the issue summary in the HTML', async () => {
  const result = await answer('linkNoText/260101T0000/mix');
  assert.ok(result.answerPage.includes('link not named'));
});

test('listViolators includes links to listDiagnoses for violators', async () => {
  const result = await answer('linkNoText/260101T0000/mix');
  const html = parse(result.answerPage);
  const diagnosisLinks = html.querySelectorAll('a[href*="listDiagnoses.html"]');
  assert.ok(diagnosisLinks.length > 0);
});

test('listViolators returns an error status for a hidden report', async () => {
  const result = await answer('linkNoText/260101T0007/hid');
  assert.equal(result.status, 'error');
});

test('listViolators returns an error status for a nonexistent report', async () => {
  const result = await answer('linkNoText/999999T9999/xyz');
  assert.equal(result.status, 'error');
});

test('listViolators returns an error status for an unknown issue', async () => {
  const result = await answer('nonexistentIssue/260101T0000/mix');
  assert.equal(result.status, 'error');
});
