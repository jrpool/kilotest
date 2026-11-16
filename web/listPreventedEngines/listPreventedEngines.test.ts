/*
  listPreventedEngines.test.ts
  UI tests for web/listPreventedEngines/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
let reportsDir: string;
let answer: () => Promise<any>;

before(async () => {
  const {fixtureDBDir} = await import('../../test/dbFixture.ts');
  process.env.DB_DIR = fixtureDBDir;
  reportsDir = path.join(fixtureDBDir, 'reports');
  ({answer} = await import('./index.ts') as any);
});

after(() => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// FUNCTIONS

// Returns a minimal usable report about a page, with preventions.
const makeReport = (
  id: string, what: string, pageID: string, preventions: Record<string, unknown>, endTime = '26-01-01T00:10'
) => ({
  id,
  what,
  target: {what, url: `https://example.com/${id}`},
  sources: {pageID},
  acts: [],
  jobData: {startTime: '26-01-01T00:00', endTime, preventions},
  catalog: {}
});
// Runs a function while temporary reports exist among the fixture reports.
const withReports = async (reports: ReturnType<typeof makeReport>[], run: () => Promise<void>) => {
  const reportPaths = reports.map(report => path.join(reportsDir, `${report.id}.json`));
  try {
    for (const [index, report] of reports.entries()) {
      await fs.writeFile(reportPaths[index]!, JSON.stringify(report, null, 2));
    }
    await run();
  }
  finally {
    for (const reportPath of reportPaths) {
      await fs.unlink(reportPath).catch(() => {});
    }
  }
};
// Returns the terms and descriptions of the list in an answer page, in document order.
const getListItems = (answerPage: string) => parse(answerPage)
.querySelectorAll('dl.preventions > dt, dl.preventions > dd')
.map(element => ({tag: element.tagName.toLowerCase(), text: element.text, element}));

// TESTS

test('listPreventedEngines returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(parse(result.answerPage).querySelector('title'));
});

test('listPreventedEngines lists a rule engine prevented in the latest report about a page', async () => {
  const items = getListItems((await answer()).answerPage);
  // The only prevention in the fixture corpus is of Alfa, named without its sponsor.
  assert.deepEqual(items.map(item => item.tag), ['dt', 'dd']);
  assert.equal(items[0]!.text, 'Alfa');
  // The description links to the issues in the report, with the extended page name as
  // the link content, and gives the reason.
  const link = items[1]!.element.querySelector('a')!;
  assert.equal(link.getAttribute('href'), '/listIssues.html/260101T0006-prv');
  assert.equal(link.text, 'Fixture Site Prevented Page');
  assert.match(items[1]!.text, /^Fixture Site Prevented Page \(tested \d+ days? ago\): page timed out$/);
});

test('listPreventedEngines omits a prevention in a superseded report', async () => {
  // A later report about the prevented fixture page, in which no rule engine was prevented.
  const later = makeReport('260301T0000-ltr', 'Prevented Page', 'p-prevente', {}, '26-03-01T00:10');
  await withReports([later], async () => {
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.equal(getListItems(result.answerPage).length, 0);
    assert.ok(result.answerPage.includes('No rule engines were prevented in the latest report of any page.'));
  });
});

test('listPreventedEngines lists the prevented rule engines in name order', async () => {
  const report = makeReport('260301T0001-mny', 'Many Page', 'p-manyprev', {
    wave: 'Not enough credits.',
    nuVal: 'HTTP 502: Bad Gateway',
    nuVnu: 'failed',
    unknownEngine: 'crashed'
  });
  await withReports([report], async () => {
    const terms = getListItems((await answer()).answerPage).filter(item => item.tag === 'dt');
    // Both implementations of the Html Checker are listed, and an unknown rule engine is
    // named by its identifier.
    assert.deepEqual(
      terms.map(item => item.text), ['Alfa', 'Html Checker', 'Html Checker API', 'unknownEngine', 'WAVE']
    );
  });
});

test('listPreventedEngines groups the pages of a rule engine, sorted by extended page name', async () => {
  const reports = [
    makeReport('260301T0002-zzz', 'Zebra Page', 'p-zebrapag', {alfa: 'crashed', axe: 'failed'}),
    makeReport('260301T0003-aaa', 'Aardvark Page', 'p-aardvark', {alfa: 'timed out'})
  ];
  await withReports(reports, async () => {
    const items = getListItems((await answer()).answerPage);
    // Alfa was prevented from testing 3 pages and Axe from testing 1. The temporary pages
    // are not in the registry, so the reports' descriptions are their names.
    assert.deepEqual(items.map(item => item.tag), ['dt', 'dd', 'dd', 'dd', 'dt', 'dd']);
    assert.equal(items[0]!.text, 'Alfa');
    assert.ok(items[1]!.text.startsWith('Aardvark Page (tested '));
    assert.ok(items[1]!.text.endsWith(': timed out'));
    assert.ok(items[2]!.text.startsWith('Fixture Site Prevented Page (tested '));
    assert.ok(items[3]!.text.startsWith('Zebra Page (tested '));
    assert.ok(items[3]!.text.endsWith(': crashed'));
    assert.equal(items[4]!.text, 'Axe');
    assert.ok(items[5]!.text.startsWith('Zebra Page (tested '));
    assert.ok(items[5]!.text.endsWith(': failed'));
  });
});

test('listPreventedEngines makes reasons, page names, and rule-engine identifiers HTML-safe', async () => {
  const report = makeReport('260301T0004-xss', 'Risky <b>Page</b>', 'p-riskypag', {
    '<i>engine</i>': 'HTTP 502 (<!DOCTYPE html>\n<script>alert("x")</script>)'
  });
  await withReports([report], async () => {
    const {answerPage} = await answer();
    assert.ok(!answerPage.includes('<script>alert'));
    assert.ok(!answerPage.includes('<b>Page</b>'));
    assert.ok(!answerPage.includes('<i>engine</i>'));
    assert.ok(answerPage.includes('<dt class="engine">&lt;i&gt;engine&lt;/i&gt;</dt>'));
    assert.ok(answerPage.includes(': HTTP 502 (&lt;!DOCTYPE html&gt; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;)'));
    assert.ok(answerPage.includes('Risky &lt;b&gt;Page&lt;/b&gt;'));
  });
});

test('listPreventedEngines truncates a long reason', async () => {
  const report = makeReport('260301T0005-lng', 'Long Page', 'p-longpage', {axe: '<'.repeat(400)});
  await withReports([report], async () => {
    const items = getListItems((await answer()).answerPage);
    const description = items.find(item => item.tag === 'dd' && item.text.startsWith('Long Page'))!;
    // The reason is truncated before it is made HTML-safe, so no entity is cut.
    assert.ok(description.text.endsWith(`: ${'<'.repeat(299)}…`));
  });
});

test('listPreventedEngines reports a prevention that has no reason', async () => {
  const report = makeReport('260301T0006-nor', 'Reasonless Page', 'p-reasonle', {axe: ''});
  await withReports([report], async () => {
    const items = getListItems((await answer()).answerPage);
    const description = items.find(item => item.tag === 'dd' && item.text.startsWith('Reasonless Page'))!;
    assert.ok(description.text.endsWith(': no reason given'));
  });
});
