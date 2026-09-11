/*
  listViolators.test.cjs
  UI tests for web/listViolators/index.ts using the fixture corpus.
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

test('listViolators handles instances with missing catalogIndex and acts with no standardResult', async () => {
  // Create a temporary report with:
  // - An act that has no standardResult (covers ?? [] on line 77)
  // - An instance with no catalogIndex (covers || '0' on line 85)
  // - A catalog entry with no tagName (covers ?? pathID fallback on lines 87-88)
  // - Multiple violators (covers plural count on line 101)
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportPath = path.join(dbDir, 'reports', '260101T0004-nvi.json');
  const report = {
    id: '260101T0004-nvi',
    target: {what: 'No Violator Info Page', url: 'https://example.com/nvi'},
    acts: [
      // Act with no standardResult (covers ?? [] fallback).
      {type: 'test', which: 'alfa', result: {}},
      // Act with instances that have missing catalogIndex.
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
                issueID: 'linkNoText',
                pathID: '/html/body/a[1]'
                // No catalogIndex: defaults to '0'
              },
              {
                ruleID: 'r12',
                what: 'Another link without a name',
                outcome: 'failed',
                issueID: 'linkNoText',
                pathID: '/html/body/div[1]/span[2]',
                catalogIndex: '1'
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
        // No tagName: covers ?? pathID fallback.
        id: '',
        text: 'Click here',
        pathID: '/html/body/a[1]'
      },
      '1': {
        tagName: 'SPAN',
        id: '',
        text: 'More text',
        pathID: '/html/body/div[1]/span[2]'
      }
    },
    images: {},
    checkpoints: []
  };
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result = await answer('linkNoText/260101T0004/nvi');
    assert.equal(result.status, 'ok');
    // Should show plural violator count.
    assert.ok(result.answerPage.includes('2 violators were'));
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});

test('listViolators uses HTML fallback when catalog has no tagName and pathID is missing', async () => {
  // Create a report where an instance has no pathID and the catalog
  // entry has no tagName, so the ?? 'HTML' fallback is hit.
  // Also uses a catalogIndex not in the catalog to cover || {} on line 144.
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportPath = path.join(dbDir, 'reports', '260101T0005-htm.json');
  const report = {
    id: '260101T0005-htm',
    target: {what: 'HTML Fallback Page', url: 'https://example.com/htm'},
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
                issueID: 'linkNoText',
                catalogIndex: '0'
                // No pathID: triggers ?? 'HTML' fallback
              },
              {
                ruleID: 'r12',
                what: 'Another violation',
                outcome: 'failed',
                issueID: 'linkNoText',
                catalogIndex: '99'
                // catalogIndex '99' is not in the catalog, covers || {} on line 144
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
        // No tagName and no pathID: both fallbacks are nullish.
        id: '',
        text: 'Some text'
      }
      // Note: no '99' entry, so catalog['99'] is undefined.
    },
    images: {},
    checkpoints: []
  };
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result = await answer('linkNoText/260101T0005/htm');
    assert.equal(result.status, 'ok');
    // The tagName should fall back to HTML.
    assert.ok(result.answerPage.includes('HTML'));
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});
