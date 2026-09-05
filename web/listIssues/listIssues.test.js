/*
  listIssues.test.js
  UI tests for web/listIssues/index.js using the fixture corpus.
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

test('listIssues returns an ok status with valid HTML for the mixed report', async () => {
  const result = await answer('260101T0000/mix');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('listIssues includes the page description in the HTML for the mixed report', async () => {
  const result = await answer('260101T0000/mix');
  assert.ok(result.answerPage.includes('Mixed Outcomes Page'));
});

test('listIssues includes links to listViolators for issues in the mixed report', async () => {
  const result = await answer('260101T0000/mix');
  const html = parse(result.answerPage);
  const violatorLinks = html.querySelectorAll('a[href*="listViolators.html"]');
  assert.ok(violatorLinks.length >= 2);
  const hrefs = violatorLinks.map(a => a.getAttribute('href'));
  assert.ok(hrefs.some(href => href.includes('linkNoText')));
  assert.ok(hrefs.some(href => href.includes('allCaps')));
});

test('listIssues returns an error status for a hidden report', async () => {
  const result = await answer('260101T0007/hid');
  assert.equal(result.status, 'error');
});

test('listIssues returns an error status for a nonexistent report', async () => {
  const result = await answer('999999T9999/xyz');
  assert.equal(result.status, 'error');
});

test('listIssues for the all-cantTell report shows no issue links', async () => {
  const result = await answer('260101T0001/ct');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const violatorLinks = html.querySelectorAll('a[href*="listViolators.html"]');
  assert.equal(violatorLinks.length, 0);
});

test('listIssues for the empty report shows no issue links', async () => {
  const result = await answer('260101T0005/emp');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const violatorLinks = html.querySelectorAll('a[href*="listViolators.html"]');
  assert.equal(violatorLinks.length, 0);
});
