/*
  listDiagnoses.test.js
  UI tests for web/listDiagnoses/index.js using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {parse} = require('node-html-parser');

// Monkey-patch util functions before requiring index, so that index.js
// destructures the patched versions.
const util = require('../../util.ts');
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

test('listDiagnoses returns an error when getReport fails after getPageDataStrings succeeds', async () => {
  getReportCallCount = 0;
  failGetReportOnCall = 1;
  try {
    const result = await answer('linkNoText/260101T0000/mix/0');
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('invalid'));
  }
  finally {
    failGetReportOnCall = -1;
  }
});

test('listDiagnoses includes a take-me-there link for a text-linkable catalog item', async () => {
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
    const result = await answer('linkNoText/260101T0003/tlk/0');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Take me there'));
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});

test('listDiagnoses returns an error for an unknown issue with a valid report', async () => {
  const result = await answer('nonexistentIssue/260101T0000/mix/0');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Issue not found');
});

test('listDiagnoses returns an error when report facts are not obtained', async () => {
  pageDataStringsOverride = {
    what: 'Mixed Outcomes Page',
    url: 'https://example.com/mixed',
    urlLink: '<a href="https://example.com/mixed">https://example.com/mixed</a>'
  };
  try {
    const result = await answer('linkNoText/260101T0000/mix/0');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Report facts not obtained');
  }
  finally {
    pageDataStringsOverride = null;
  }
});

test('listDiagnoses handles acts with no standardResult instances gracefully', async () => {
  // Create a temporary report where an act has no standardResult.
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportPath = path.join(dbDir, 'reports', '260101T0004-nst.json');
  const report = {
    id: '260101T0004-nst',
    target: {what: 'No Standard Result Page', url: 'https://example.com/noresult'},
    acts: [
      {
        type: 'test',
        which: 'axe',
        result: {}
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
        pathID: '/html/body/a[1]'
      }
    },
    images: {},
    checkpoints: []
  };
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result = await answer('linkNoText/260101T0004/nst/0');
    assert.equal(result.status, 'ok');
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});
