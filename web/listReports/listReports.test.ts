/*
  listReports.test.ts
  UI tests for web/listReports/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  // Ensure job subdirectories exist (they are empty and not tracked by Git).
  for (const sub of ['queue', 'claimed', 'failed']) {
    await fs.mkdir(path.join(process.env.DB_DIR, 'jobs', sub), {recursive: true});
  }
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
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Pages tested | Kilotest');
});

test('listReports includes the 8 non-hidden fixture reports as details elements', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const details = html.querySelectorAll('details');
  assert.equal(details.length, 8);
});

test('listReports includes the page descriptions in summary elements', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const summaries = html.querySelectorAll('details > summary').map(s => s.text);
  assert.ok(summaries.some(s => s.startsWith('Mixed Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('All CantTell Page')));
  assert.ok(summaries.some(s => s.startsWith('No Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('Empty Results Page')));
  assert.ok(summaries.some(s => s.startsWith('Prevented Page')));
});

test('listReports does not include the hidden report', async () => {
  const result: any = await answer();
  assert.ok(!result.answerPage.includes('Hidden Page'));
});

test('listReports includes links to listIssues for reports with issues', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const issueLinks = html.querySelectorAll('a[href*="listIssues.html"]');
  assert.ok(issueLinks.length > 0);
  const hrefs = issueLinks.map(a => a.getAttribute('href'));
  assert.ok(hrefs.some(href => href?.includes('260101T0000/mix')));
});

test('listReports includes the page URLs in the report details', async () => {
  const result: any = await answer();
  assert.ok(result.answerPage.includes('https://example.com/mixed'));
  assert.ok(result.answerPage.includes('https://example.com/canttell'));
});

test('listReports includes a link to request testing a new page', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const testLink = html.querySelector('a[href="requestNewTestForm.html"]');
  assert.ok(testLink);
});

test('listReports shows requests when testRequests.json has entries', {timeout: 500}, async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const testRequestsPath = path.join(dbDir, 'jobs', 'testRequests.json');
  const originalTestRequests = await fs.readFile(testRequestsPath, 'utf8');
  try {
    const testRequests = {
      'https://example.com/mixed': [
        {description: 'Mixed Outcomes Page', reason: 'Needs retesting for accessibility'}
      ]
    };
    await fs.writeFile(testRequestsPath, JSON.stringify(testRequests, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('https://example.com/mixed'));
    assert.ok(result.answerPage.includes('Needs retesting for accessibility'));
  }
  finally {
    await fs.writeFile(testRequestsPath, originalTestRequests);
  }
});

test('listReports shows queued and claimed jobs when they exist', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const queueDir = path.join(dbDir, 'jobs', 'queue');
  const claimedDir = path.join(dbDir, 'jobs', 'claimed');
  const queueFile = path.join(queueDir, 'queuedJob.json');
  const claimedFile = path.join(claimedDir, 'claimedJob.json');
  try {
    const queuedJob = {
      target: {url: 'https://example.com/queued', what: 'Queued Page'}
    };
    const claimedJob = {
      target: {url: 'https://example.com/claimed', what: 'Claimed Page'}
    };
    await fs.writeFile(queueFile, JSON.stringify(queuedJob, null, 2));
    await fs.writeFile(claimedFile, JSON.stringify(claimedJob, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('https://example.com/queued'));
    assert.ok(result.answerPage.includes('Queued Page'));
    assert.ok(result.answerPage.includes('https://example.com/claimed'));
    assert.ok(result.answerPage.includes('Claimed Page'));
  }
  finally {
    await fs.unlink(queueFile).catch(() => {});
    await fs.unlink(claimedFile).catch(() => {});
  }
});

test('listReports shows claimed retest status for a report with a matching claimed job', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const claimedDir = path.join(dbDir, 'jobs', 'claimed');
  const claimedFile = path.join(claimedDir, 'claimedRetest.json');
  try {
    const claimedJob = {
      target: {url: 'https://example.com/mixed', what: 'Mixed Outcomes Page'}
    };
    await fs.writeFile(claimedFile, JSON.stringify(claimedJob, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Currently being retested'));
  }
  finally {
    await fs.unlink(claimedFile).catch(() => {});
  }
});

test('listReports shows queued retest status for a report with a matching queued job', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const queueDir = path.join(dbDir, 'jobs', 'queue');
  const queueFile = path.join(queueDir, 'queuedRetest.json');
  try {
    const queuedJob = {
      target: {url: 'https://example.com/mixed', what: 'Mixed Outcomes Page'}
    };
    await fs.writeFile(queueFile, JSON.stringify(queuedJob, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Currently in the queue for retesting'));
  }
  finally {
    await fs.unlink(queueFile).catch(() => {});
  }
});

test('listReports returns an error when a report file is invalid', {timeout: 500}, async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const reportsDir = path.join(dbDir, 'reports');
  const invalidReportPath = path.join(reportsDir, '260101T9999-bad.json');
  try {
    // Valid for getReportExtract (has target and jobData.endTime) but not usable by isUsableReport (no acts or catalog).
    const invalidReport = {
      target: {what: 'Invalid Report', url: 'https://example.com/invalid'},
      jobData: {endTime: '26-01-01T00:10'}
    };
    await fs.writeFile(invalidReportPath, JSON.stringify(invalidReport, null, 2));
    const result: any = await answer();
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
  finally {
    await fs.unlink(invalidReportPath).catch(() => {});
  }
});

test('listReports shows no-reports message when the database is empty', async () => {
  // Create a temp DB with empty reports and jobs directories.
  const os = await import('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listreports-empty-'));
  await fs.mkdir(path.join(tmpDir, 'reports'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'queue'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'claimed'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'failed'), {recursive: true});
  await fs.writeFile(path.join(tmpDir, 'jobs', 'testRequests.json'), '{}\n');
  const savedDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {answer} = await import('./index.ts');
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('no'));
    assert.ok(result.answerPage.includes(' a '));
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});

// Returns the details element of the report whose summary starts with a description and whose issue link, if required, contains a fragment.
const getReportDetails = (html: any, description: string, hrefFragment?: string) => {
  const matches = html.querySelectorAll('details').filter((d: any) => {
    const summary = d.querySelector('summary')?.text ?? '';
    if (!summary.startsWith(description)) {
      return false;
    }
    return hrefFragment === undefined
    || d.querySelectorAll('a').some((a: any) => a.getAttribute('href')?.includes(hrefFragment));
  });
  assert.equal(matches.length, 1, `exactly one report matches ${description} ${hrefFragment ?? ''}`);
  return matches[0];
};

// Returns the rule-engine line, the prevention line, and the 3 summary amounts of a details element.
const getResultFacts = (details: any) => {
  const items = details.querySelectorAll('li');
  const itemTexts: string[] = items.map((li: any) => li.text.trim());
  const getAmount = (label: string) => {
    const text = itemTexts.find(t => t.startsWith(`${label}: `));
    assert.ok(text, `${label} item exists`);
    return Number(text.slice(label.length + 2));
  };
  // The summary item is the parent of the 3 amount items.
  const summaryItem = items.find((li: any) => li.text.trim().startsWith('Summary of results:'));
  assert.ok(summaryItem, 'Summary of results item exists');
  const amountLabels = summaryItem.querySelectorAll('ul > li').map((li: any) => li.text.trim().split(':')[0]);
  return {
    reporterLine: itemTexts.find(t => t.endsWith('reported issues') || t.includes('reported issues (')),
    preventionLine: itemTexts.find(t => t.startsWith('Page not testable by')),
    amountLabels,
    violations: getAmount('Violations'),
    violators: getAmount('Violators'),
    issues: getAmount('Issues')
  };
};

// Expected facts, hand-computed from the fixtures.
const expectedFacts: [string, string | undefined, string, number, number, number][] = [
  // Description, issue-link fragment, reporter line, violations, violators, issues.
  ['Mixed Outcomes Page', '260101T0000/mix', '2 rule engines reported issues (Alfa + Axe)', 3, 2, 2],
  ['Mixed Outcomes Page', '260202T0000/new', '1 rule engine reported issues (Axe)', 1, 1, 1],
  ['All CantTell Page', undefined, '0 rule engines reported issues', 0, 0, 0],
  ['No Outcomes Page', undefined, '1 rule engine reported issues (Accessibility Checker)', 1, 1, 1],
  ['Empty Results Page', undefined, '0 rule engines reported issues', 0, 0, 0],
  ['Prevented Page', undefined, '1 rule engine reported issues (Axe)', 1, 1, 1],
  ['Multi Violator Page', undefined, '2 rule engines reported issues (Alfa + Axe)', 4, 3, 1],
  ['Branch Coverage Page', undefined, '1 rule engine reported issues (Axe)', 4, 4, 1]
];

for (const [description, fragment, reporterLine, violations, violators, issues] of expectedFacts) {
  test(`listReports gives correct rule-engine count and names and summary amounts for ${description}${fragment ? ` (${fragment})` : ''}`, async () => {
    const result: any = await answer();
    const html = parse(result.answerPage);
    const facts = getResultFacts(getReportDetails(html, description, fragment));
    assert.equal(facts.reporterLine, reporterLine);
    assert.deepEqual(facts.amountLabels, ['Violations', 'Violators', 'Issues']);
    assert.equal(facts.violations, violations);
    assert.equal(facts.violators, violators);
    assert.equal(facts.issues, issues);
  });
}

test('listReports reports the prevented rule engine only for the report with a prevention', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const prevented = getResultFacts(getReportDetails(html, 'Prevented Page'));
  assert.equal(prevented.preventionLine, 'Page not testable by 1 rule engine (Alfa)');
  const others = html.querySelectorAll('details').filter((d: any) => !d.text.includes('Prevented Page'));
  assert.equal(others.length, 7);
  assert.ok(others.every((d: any) => !d.text.includes('Page not testable by')));
});
