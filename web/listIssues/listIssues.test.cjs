/*
  listIssues.test.cjs
  UI tests for web/listIssues/index.ts using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {parse} = require('node-html-parser');

// Monkey-patch util functions before requiring index, so that index.js
// destructures the patched versions.
const util = require('../../util.ts');
const realIsHidden = util.isHidden;
const realGetPageDataStrings = util.getPageDataStrings;
let isHiddenCallCount = 0;
let forceHiddenOnCall = -1;
let pageDataStringsOverride = null;
util.isHidden = async (timeStamp, jobID) => {
  isHiddenCallCount++;
  if (isHiddenCallCount === forceHiddenOnCall) {
    return true;
  }
  return realIsHidden(timeStamp, jobID);
};
util.getPageDataStrings = async (...args) => {
  if (pageDataStringsOverride !== null) {
    return pageDataStringsOverride;
  }
  return realGetPageDataStrings(...args);
};

const {answer} = require('./index.ts');

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

test('listIssues returns an error when a report becomes hidden during processing', async () => {
  isHiddenCallCount = 0;
  forceHiddenOnCall = 2;
  try {
    const result = await answer('260101T0000/mix');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Report is not available');
  }
  finally {
    forceHiddenOnCall = -1;
  }
});

test('listIssues includes prevention notices for the prevented report', async () => {
  const result = await answer('260101T0006/prv');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Page not testable by'));
  assert.ok(result.answerPage.includes('page timed out'));
});

test('listIssues returns an error when getPageDataStrings fails after getData succeeds', async () => {
  pageDataStringsOverride = {error: 'Page data strings error'};
  try {
    const result = await answer('260101T0000/mix');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Page data strings error');
  }
  finally {
    pageDataStringsOverride = null;
  }
});

test('listIssues returns an error when report facts are not obtained', async () => {
  pageDataStringsOverride = {
    what: 'Mixed Outcomes Page',
    url: 'https://example.com/mixed',
    urlLink: '<a href="https://example.com/mixed">https://example.com/mixed</a>'
  };
  try {
    const result = await answer('260101T0000/mix');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Report facts not obtained');
  }
  finally {
    pageDataStringsOverride = null;
  }
});

test('listIssues shows plural violator count for an issue with multiple violators', async () => {
  // The mul report has linkNoText with 3 violators.
  const result = await answer('260101T0008/mul');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('3 violators were'));
});

test('listIssues handles acts with no standardResult instances', async () => {
  // Create a temporary report with an act that has no standardResult.
  const fs = require('node:fs/promises');
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportPath = path.join(dbDir, 'reports', '260101T0004-nsi.json');
  const report = {
    id: '260101T0004-nsi',
    target: {what: 'No Std Instances Page', url: 'https://example.com/nsi'},
    acts: [
      {type: 'test', which: 'axe', result: {}}
    ],
    jobData: {
      startTime: '26-01-01T00:00',
      endTime: '26-01-01T00:10',
      preventions: {},
      issuelessRules: []
    },
    catalog: {},
    images: {},
    checkpoints: []
  };
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result = await answer('260101T0004/nsi');
    assert.equal(result.status, 'ok');
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});
