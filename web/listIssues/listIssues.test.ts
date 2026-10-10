/*
  listIssues.test.ts
  UI tests for web/listIssues/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after, mock} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parse} from 'node-html-parser';

// Mock the util functions called by index.ts before requiring it, so that
// it imports the mocked versions. Other exports delegate to the real module.
import * as realUtil from '../../util.ts';
import * as realWebUtil from '../util.ts';
let pageDataStringsOverride: any = null;
mock.module('../util.ts', {
  exports: {
    ...realWebUtil,
    getPageDataStrings: (...args: any[]) => {
      if (pageDataStringsOverride !== null) {
        return pageDataStringsOverride;
      }
      return (realWebUtil.getPageDataStrings as any)(...args);
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

test('listIssues interpolates the page description into the AI prompt block quote', async () => {
  const result = await answer('260101T0000/mix');
  const html = parse(result.answerPage);
  const blockQuote = html.querySelector('details blockquote');
  assert.ok(blockQuote);
  assert.ok(
    blockQuote.textContent.startsWith('Kilotest reports defects on the Mixed Outcomes Page web page.')
  );
  // No placeholder may remain uninterpolated.
  assert.ok(!blockQuote.textContent.includes('__target__'));
});

test('listIssues includes links to listViolators for issues in the mixed report', async () => {
  const result = await answer('260101T0000/mix');
  const html = parse(result.answerPage);
  const violatorLinks = html.querySelectorAll('a[href*="listViolators.html"]');
  assert.ok(violatorLinks.length >= 2);
  const hrefs = violatorLinks.map(a => a.getAttribute('href'));
  assert.ok(hrefs.some(href => href?.includes('linkNoText')));
  assert.ok(hrefs.some(href => href?.includes('allCaps')));
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


test('listIssues counts the prevented rule engine as called but not able to test', async () => {
  const result = await answer('260101T0006/prv');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('<li>Called: 2</li>'));
  assert.ok(result.answerPage.includes('<li>Were able to test: 1</li>'));
  assert.ok(result.answerPage.includes('<li>Reported any rule violations: 1</li>'));
});

test('listIssues counts a rule engine that reported no violations as called and able to test', async () => {
  const result = await answer('260101T0005/emp');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('<li>Called: 1</li>'));
  assert.ok(result.answerPage.includes('<li>Were able to test: 1</li>'));
  assert.ok(result.answerPage.includes('<li>Reported any rule violations: 0</li>'));
});

test('listIssues counts an unknown prevented engine as called but not able to test', async () => {
  const fs = await import('node:fs/promises');
  const prvJSON = await fs.readFile(path.join(realUtil.reportsPath(), '260101T0006-prv.json'), 'utf8');
  const report = JSON.parse(prvJSON);
  report.jobData.preventions.unknownEngine = 'mystery failure';
  const reportPath = path.join(realUtil.reportsPath(), '260103T0000-unk.json');
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result = await answer('260103T0000/unk');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('<li>Called: 3</li>'));
    assert.ok(result.answerPage.includes('<li>Were able to test: 1</li>'));
  }
  finally {
    await fs.unlink(reportPath);
  }
});

test('listIssues returns an error when getPageDataStrings fails after getReport succeeds', async () => {
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

test('listIssues shows violation and violator counts for an issue with multiple violators', async () => {
  // The mul report has linkNoText with 4 violations by 3 violators.
  const result = await answer('260101T0008/mul');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('<li>Violations: 4</li>'));
  assert.ok(result.answerPage.includes('<li>Violators: 3</li>'));
});

test('listIssues handles acts with no standardResult instances', async () => {
  // Create a temporary report with an act that has no standardResult.
  const fs = await import('node:fs/promises');
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
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

// Returns the History section of a listIssues page, from its heading to the next heading.
const getHistory = (answerPage: string) => {
  const start = answerPage.indexOf('<h2>History</h2>');
  const end = answerPage.indexOf('<h2>Issues reported</h2>');
  assert.ok(start > -1 && end > start, 'History section exists before the issues');
  return parse(answerPage.slice(start, end));
};

// Returns the text, and the link destination if any, of each item in a History list.
const getHistoryItems = (history: ReturnType<typeof parse>) => history
.querySelectorAll('ol > li')
.map(li => ({
  text: li.text.trim(),
  href: li.querySelector('a')?.getAttribute('href') ?? null
}));

test('listIssues History of an older report lists all reports, with this one unlinked and no retest question', async () => {
  const result = await answer('260101T0000/mix');
  const history = getHistory(result.answerPage);
  const items = getHistoryItems(history);
  assert.equal(items.length, 2);
  assert.match(items[0]!.text, /^\d+ days? ago \(oldest; this report\)$/);
  assert.equal(items[0]!.href, null);
  assert.match(items[1]!.text, /^\d+ days? ago \(latest\)$/);
  assert.equal(items[1]!.href, '/listIssues.html/260202T0000/new');
  assert.ok(!result.answerPage.includes('Should Kilotest retest the page?'));
});

test('listIssues History of the latest report ends with the retest question', async () => {
  const result = await answer('260202T0000/new');
  const history = getHistory(result.answerPage);
  const items = getHistoryItems(history);
  assert.equal(items.length, 2);
  assert.match(items[0]!.text, /^\d+ days? ago \(oldest\)$/);
  assert.equal(items[0]!.href, '/listIssues.html/260101T0000/mix');
  assert.match(items[1]!.text, /^\d+ days? ago \(latest; this report\)$/);
  assert.equal(items[1]!.href, null);
  const retestLink = history.querySelector('ol + p > a');
  assert.equal(retestLink?.text, 'Should Kilotest retest the page?');
  assert.equal(retestLink?.getAttribute('href'), '/requestRetestForm.html/260202T0000/new');
});

test('listIssues History of the only report about a page says so and asks about retesting', async () => {
  const result = await answer('260101T0001/ct');
  const history = getHistory(result.answerPage);
  assert.equal(getHistoryItems(history).length, 0);
  const paragraphs = history.querySelectorAll('p');
  assert.equal(paragraphs[0]?.text, 'This is the only report about the page.');
  assert.equal(paragraphs[1]?.querySelector('a')?.getAttribute('href'), '/requestRetestForm.html/260101T0001/ct');
});

test('listIssues History tags only the ends of a list of 3 reports and the current report', async () => {
  const fs = await import('node:fs/promises');
  const mixJSON = await fs.readFile(path.join(realUtil.reportsPath(), '260101T0000-mix.json'), 'utf8');
  const report = JSON.parse(mixJSON);
  report.jobData.endTime = '26-01-15T00:10';
  const reportPath = path.join(realUtil.reportsPath(), '260115T0000-mid.json');
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    // From the middle report:
    let items = getHistoryItems(getHistory((await answer('260115T0000/mid')).answerPage));
    assert.equal(items.length, 3);
    assert.match(items[0]!.text, /\(oldest\)$/);
    assert.match(items[1]!.text, /^\d+ days? ago \(this report\)$/);
    assert.equal(items[1]!.href, null);
    assert.match(items[2]!.text, /\(latest\)$/);
    // From the latest report:
    items = getHistoryItems(getHistory((await answer('260202T0000/new')).answerPage));
    assert.match(items[1]!.text, /^\d+ days? ago$/);
    assert.equal(items[1]!.href, '/listIssues.html/260115T0000/mid');
  }
  finally {
    await fs.unlink(reportPath);
  }
});
