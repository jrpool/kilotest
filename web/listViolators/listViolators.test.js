/*
  listViolators.test.js
  UI tests for web/listViolators/index.js using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {parse} = require('node-html-parser');

// Monkey-patch util functions before requiring index, so that index.js
// destructures the patched versions.
const util = require('../../util');
const realGetReport = util.getReport;
const realGetPageDataStrings = util.getPageDataStrings;
let getReportCallCount = 0;
let failGetReportOnCall = -1;
let pageDataStringsOverride = null;
util.getReport = async (...args) => {
  getReportCallCount++;
  if (getReportCallCount === failGetReportOnCall) {
    return {error: 'Report is invalid (test override)'};
  }
  return realGetReport(...args);
};
util.getPageDataStrings = async (...args) => {
  if (pageDataStringsOverride !== null) {
    return pageDataStringsOverride;
  }
  return realGetPageDataStrings(...args);
};

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

test('listViolators returns an error when getReport fails after getPageDataStrings succeeds', async () => {
  getReportCallCount = 0;
  failGetReportOnCall = 1;
  try {
    const result = await answer('linkNoText/260101T0000/mix');
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('invalid'));
  }
  finally {
    failGetReportOnCall = -1;
  }
});

test('listViolators includes take-me-there links for text-linkable violators', async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportsDir = path.join(dbDir, 'reports');
  const reportPath = path.join(reportsDir, '260101T0003-tlk.json');
  try {
    const report = {
      id: '260101T0003-tlk',
      what: 'Text Linkable Page',
      target: {what: 'Text Linkable Page', url: 'https://example.com/textlinkable'},
      acts: [
        {
          type: 'test',
          which: 'axe',
          result: {
            standardResult: {
              instances: [
                {
                  ruleID: 'r11',
                  what: 'The link does not have an accessible name',
                  outcome: 'failed',
                  count: 1,
                  catalogIndex: '0',
                  issueID: 'linkNoText'
                }
              ]
            }
          }
        }
      ],
      jobData: {
        startTime: '26-01-01T00:00',
        endTime: '26-01-01T00:10',
        preventions: {},
        issuelessRules: []
      },
      catalog: {
        '0': {
          tagName: 'A',
          id: '',
          startTag: '<a>',
          text: 'Click here',
          textLinkable: true,
          boxID: '10:20:80:30',
          pathID: '/html/body/a[1]'
        }
      },
      images: {},
      checkpoints: []
    };
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    const result = await answer('linkNoText/260101T0003/tlk');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Take me there'));
    assert.ok(result.answerPage.includes('Take me there</q> links will open'));
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});

test('listViolators returns an error when report facts are not obtained', async () => {
  pageDataStringsOverride = {
    what: 'Mixed Outcomes Page',
    url: 'https://example.com/mixed',
    urlLink: '<a href="https://example.com/mixed">https://example.com/mixed</a>'
  };
  try {
    const result = await answer('linkNoText/260101T0000/mix');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Report facts not obtained');
  }
  finally {
    pageDataStringsOverride = null;
  }
});
