/*
  listDiagnoses.test.js
  UI tests for web/listDiagnoses/index.js using the fixture corpus.
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

test('listDiagnoses returns an ok status with valid HTML for catalogIndex 0, linkNoText, in the mixed report', async () => {
  const result = await answer('linkNoText/260101T0000/mix/0');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('listDiagnoses includes the issue summary in the HTML', async () => {
  const result = await answer('linkNoText/260101T0000/mix/0');
  assert.ok(result.answerPage.includes('link not named'));
});

test('listDiagnoses includes the element tag name and text from the catalog', async () => {
  const result = await answer('linkNoText/260101T0000/mix/0');
  assert.ok(result.answerPage.includes('About Us'));
});

test('listDiagnoses includes diagnosis descriptions from the rule engines', async () => {
  const result = await answer('linkNoText/260101T0000/mix/0');
  assert.ok(result.answerPage.includes('The link does not have an accessible name'));
});

test('listDiagnoses returns an error status for a hidden report', async () => {
  const result = await answer('linkNoText/260101T0007/hid/0');
  assert.equal(result.status, 'error');
});

test('listDiagnoses returns an error status for a nonexistent report', async () => {
  const result = await answer('linkNoText/999999T9999/xyz/0');
  assert.equal(result.status, 'error');
});

test('listDiagnoses returns ok with no diagnoses for a nonexistent catalog index', async () => {
  const result = await answer('linkNoText/260101T0000/mix/999');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const diagnosisItems = html.querySelectorAll('li');
  // The page may have other li elements, but none should contain diagnosis descriptions.
  const diagnosisTexts = diagnosisItems.map(li => li.text);
  assert.ok(!diagnosisTexts.some(t => t.includes('The link does not have an accessible name')));
});
