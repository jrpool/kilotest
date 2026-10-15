/*
  listTopIssues.test.ts
  UI tests for web/listTopIssues/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after, mock} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';

// Mock the util functions called by index.ts before importing it, so that
// it imports the mocked versions. Other exports delegate to the real module.
import * as realUtil from '../../util.ts';
let getReportCallCount = 0;
let failGetReportOnCall = -1;
mock.module('../../util.ts', {
  exports: {
    ...realUtil,
    getReport: async (...args: any[]) => {
      getReportCallCount++;
      if (getReportCallCount === failGetReportOnCall) {
        return {error: 'Report is invalid (test override)'};
      }
      return (realUtil.getReport as any)(...args);
    }
  }
} as any);

const {answer} = await import('./index.ts') as any;

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../../test/dbFixture.ts')).fixtureDBDir;
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
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('listTopIssues includes priority headings in the page', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('priority'));
});

test('listTopIssues excludes cantTell instances from issue counts', async () => {
  // In the fixture corpus, focusIndicationBad is reported only with a cantTell outcome
  // (in the mixed and all-cantTell reports), never as a violation, so it should not
  // appear in the summary.
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(!result.answerPage.includes('focus indication poor'));
});

test('listTopIssues omits a report that is not usable', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const reportsDir = path.join(dbDir, 'reports');
  const invalidReportPath = path.join(reportsDir, '260101T9999-bad.json');
  try {
    // Not usable by isUsableReport (no acts or catalog), so it produces no extract
    // and contributes nothing to the summary.
    const invalidReport = {
      target: {what: 'Invalid TopIssues Report', url: 'https://example.com/invalidtop'},
      jobData: {endTime: '26-01-01T00:10'}
    };
    await fs.writeFile(invalidReportPath, JSON.stringify(invalidReport, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'ok');
  }
  finally {
    await fs.unlink(invalidReportPath).catch(() => {});
  }
});

test('listTopIssues returns an error when a report read fails', async () => {
  getReportCallCount = 0;
  failGetReportOnCall = 1;
  try {
    const result: any = await answer();
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
  finally {
    failGetReportOnCall = -1;
  }
});

test('listTopIssues handles reports with unclassified issue IDs', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
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
    const result: any = await answer();
    // The unclassified issue is skipped, but the page should still render successfully.
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage);
  }
  finally {
    await fs.unlink(reportPath).catch(() => {});
  }
});
