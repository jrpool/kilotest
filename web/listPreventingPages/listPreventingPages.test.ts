/*
  listPreventingPages.test.ts
  UI tests for web/listPreventingPages/index.ts using the fixture corpus.
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

test('listPreventingPages returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(parse(result.answerPage).querySelector('title'));
});

test('listPreventingPages lists a page whose latest report has a prevention', async () => {
  const result = await answer();
  const items = getListItems(result.answerPage);
  const termIndex = items.findIndex(item => item.tag === 'dt' && item.text.includes('Fixture Site Prevented Page'));
  assert.notEqual(termIndex, -1);
  // The term links to the issues in the report, with the extended page name as its content.
  const link = items[termIndex]!.element.querySelector('a')!;
  assert.equal(link.getAttribute('href'), '/listIssues.html/260101T0006-prv');
  assert.equal(link.text, 'Fixture Site Prevented Page');
  // Only the link, not the test date, is in the term's link.
  assert.match(items[termIndex]!.text, /^Fixture Site Prevented Page \(tested \d+ days? ago\)$/);
  // The description names the rule engine, without its sponsor, and gives the reason.
  assert.deepEqual(
    {tag: items[termIndex + 1]!.tag, text: items[termIndex + 1]!.text},
    {tag: 'dd', text: 'Alfa: page timed out'}
  );
});

test('listPreventingPages omits pages whose latest reports have no preventions', async () => {
  const result = await answer();
  const terms = getListItems(result.answerPage).filter(item => item.tag === 'dt');
  assert.equal(terms.length, 1);
  assert.ok(!result.answerPage.includes('Mixed Outcomes'));
});

test('listPreventingPages omits a prevention in a superseded report', async () => {
  // A later report about the prevented fixture page, in which no rule engine was prevented.
  const later = makeReport('260301T0000-ltr', 'Prevented Page', 'p-prevente', {}, '26-03-01T00:10');
  await withReports([later], async () => {
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.equal(getListItems(result.answerPage).length, 0);
    assert.ok(result.answerPage.includes('No rule engines were prevented in the latest report of any page.'));
  });
});

test('listPreventingPages lists the prevented rule engines of a report in name order', async () => {
  const report = makeReport('260301T0001-mny', 'Many Page', 'p-manyprev', {
    wave: 'Not enough credits.',
    nuVal: 'HTTP 502: Bad Gateway',
    nuVnu: 'failed',
    unknownEngine: 'crashed'
  });
  await withReports([report], async () => {
    const items = getListItems((await answer()).answerPage);
    const termIndex = items.findIndex(item => item.tag === 'dt' && item.text.includes('Many Page'));
    assert.notEqual(termIndex, -1);
    // The page is not in the registry, so the report's description is its name. Both
    // implementations of the Html Checker are listed, and an unknown rule engine is
    // named by its identifier.
    assert.deepEqual(items.slice(termIndex + 1, termIndex + 5).map(item => item.text), [
      'Html Checker: failed',
      'Html Checker API: HTTP 502: Bad Gateway',
      'unknownEngine: crashed',
      'WAVE: Not enough credits.'
    ]);
  });
});

test('listPreventingPages sorts the pages by extended page name', async () => {
  const report = makeReport('260301T0002-aaa', 'Aardvark Page', 'p-aardvark', {axe: 'failed'});
  await withReports([report], async () => {
    const terms = getListItems((await answer()).answerPage).filter(item => item.tag === 'dt');
    assert.equal(terms.length, 2);
    assert.ok(terms[0]!.text.startsWith('Aardvark Page'));
    assert.ok(terms[1]!.text.startsWith('Fixture Site Prevented Page'));
  });
});

test('listPreventingPages makes reasons and page names HTML-safe', async () => {
  const report = makeReport('260301T0003-xss', 'Risky <b>Page</b>', 'p-riskypag', {
    alfa: 'HTTP 502 (<!DOCTYPE html>\n<script>alert("x")</script>)'
  });
  await withReports([report], async () => {
    const {answerPage} = await answer();
    assert.ok(!answerPage.includes('<script>alert'));
    assert.ok(!answerPage.includes('<b>Page</b>'));
    assert.ok(answerPage.includes('<span class="engine">Alfa</span>: HTTP 502 (&lt;!DOCTYPE html&gt; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;)'));
    assert.ok(answerPage.includes('Risky &lt;b&gt;Page&lt;/b&gt;'));
  });
});

test('listPreventingPages truncates a long reason', async () => {
  const report = makeReport('260301T0004-lng', 'Long Page', 'p-longpage', {alfa: '<'.repeat(400)});
  await withReports([report], async () => {
    const items = getListItems((await answer()).answerPage);
    const description = items.find(item => item.tag === 'dd' && item.text.startsWith('Alfa: <'))!;
    // The reason is truncated before it is made HTML-safe, so no entity is cut.
    assert.equal(description.text, `Alfa: ${'<'.repeat(299)}…`);
  });
});

test('listPreventingPages reports a prevention that has no reason', async () => {
  const report = makeReport('260301T0005-nor', 'Reasonless Page', 'p-reasonle', {alfa: ''});
  await withReports([report], async () => {
    assert.ok((await answer()).answerPage.includes('<dd><span class="engine">Alfa</span>: no reason given</dd>'));
  });
});
