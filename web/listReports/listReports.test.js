/*
  listReports.test.js
  UI tests for web/listReports/index.js using the fixture corpus.
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

test('listReports returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title').text, 'Pages tested | Kilotest');
});

test('listReports includes the 6 non-hidden fixture reports as details elements', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const details = html.querySelectorAll('details');
  assert.equal(details.length, 6);
});

test('listReports includes the page descriptions in summary elements', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const summaries = html.querySelectorAll('details > summary').map(s => s.text);
  assert.ok(summaries.some(s => s.startsWith('Mixed Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('All CantTell Page')));
  assert.ok(summaries.some(s => s.startsWith('No Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('Empty Results Page')));
  assert.ok(summaries.some(s => s.startsWith('Prevented Page')));
});

test('listReports does not include the hidden report', async () => {
  const result = await answer();
  assert.ok(!result.answerPage.includes('Hidden Page'));
});

test('listReports includes links to listIssues for reports with issues', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const issueLinks = html.querySelectorAll('a[href*="listIssues.html"]');
  assert.ok(issueLinks.length > 0);
  const hrefs = issueLinks.map(a => a.getAttribute('href'));
  assert.ok(hrefs.some(href => href.includes('260101T0000/mix')));
});

test('listReports includes the page URLs in the report details', async () => {
  const result = await answer();
  assert.ok(result.answerPage.includes('https://example.com/mixed'));
  assert.ok(result.answerPage.includes('https://example.com/canttell'));
});

test('listReports includes a link to request testing a new page', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const testLink = html.querySelector('a[href="requestTestForm.html"]');
  assert.ok(testLink);
});
