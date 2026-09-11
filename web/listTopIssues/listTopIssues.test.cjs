/*
  listTopIssues.test.cjs
  UI tests for web/listTopIssues/index.ts using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {parse} = require('node-html-parser');
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

test('listTopIssues returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('listTopIssues includes priority headings in the page', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('priority'));
});

test('listTopIssues returns an error when a report file is invalid', async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportsDir = path.join(dbDir, 'reports');
  const invalidReportPath = path.join(reportsDir, '260101T9999-bad.json');
  try {
    // Valid for getReportExtract (has target and jobData.endTime) but invalid for isValidReport (no acts or catalog).
    const invalidReport = {
      target: {what: 'Invalid TopIssues Report', url: 'https://example.com/invalidtop'},
      jobData: {endTime: '26-01-01T00:10'}
    };
    await fs.writeFile(invalidReportPath, JSON.stringify(invalidReport, null, 2));
    const result = await answer();
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
  finally {
    await fs.unlink(invalidReportPath).catch(() => {});
  }
});

test('listTopIssues handles reports with unclassified issue IDs', async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportsDir = path.join(dbDir, 'reports');
  const reportPath = path.join(reportsDir, '260101T0004-unc.json');
  try {
    const report = {
      id: '260101T0004-unc',
      what: 'Unclassified Issue Page',
      target: {what: 'Unclassified Issue Page', url: 'https://example.com/unclassified'},
      acts: [
        {
          type: 'test',
          which: 'axe',
          result: {
            standardResult: {
              instances: [
                {
                  ruleID: 'r99',
                  what: 'Some unclassified issue',
                  outcome: 'failed',
                  count: 1,
                  catalogIndex: '0',
                  issueID: 'nonexistentIssue'
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
          tagName: 'DIV',
          id: '',
          startTag: '<div>',
          text: '',
          textLinkable: false,
          boxID: '0:0:100:50',
          pathID: '/html/body/div[1]'
        }
      },
      images: {},
      checkpoints: []
    };
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    const result = await answer();
    // The unclassified issue is skipped, but the page should still render successfully.
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage);
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});
