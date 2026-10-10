/*
  listPages.test.ts
  UI tests for web/listPages/index.ts using the fixture corpus.
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

test('listPages returns an ok status with valid HTML', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Pages tested | Kilotest');
});

// Returns the links in the list of tested pages.
const getPageLinks = (answerPage: string) => {
  const html = parse(answerPage);
  return html.querySelectorAll('main > ul > li > a');
};

test('listPages lists each of the 7 tested pages once, by description', async () => {
  const result: any = await answer();
  const links = getPageLinks(result.answerPage);
  assert.deepEqual(
    links.map(a => a.text),
    [
      'All CantTell Page',
      'Branch Coverage Page',
      'Empty Results Page',
      'Mixed Outcomes',
      'Multi Violator Page',
      'No Outcomes Page',
      'Prevented Page'
    ]
  );
});

test('listPages introduces the list of tested pages', async () => {
  const result: any = await answer();
  assert.ok(result.answerPage.includes('<p>Get test results for:</p>'));
  assert.ok(!result.answerPage.includes('No pages have been tested yet.'));
});

test('listPages links each page to the issues in its latest report', async () => {
  const result: any = await answer();
  const links = getPageLinks(result.answerPage);
  const mixedLink = links.find(a => a.text === 'Mixed Outcomes');
  assert.equal(mixedLink?.getAttribute('href'), 'listIssues.html/260202T0000/new');
  const canttellLink = links.find(a => a.text === 'All CantTell Page');
  assert.equal(canttellLink?.getAttribute('href'), 'listIssues.html/260101T0001/ct');
});

test('listPages contains no report summaries', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  assert.equal(html.querySelectorAll('details').length, 0);
  assert.ok(!result.answerPage.includes('https://example.com/mixed'));
});

test('listPages does not include the hidden report', async () => {
  const result: any = await answer();
  assert.ok(!result.answerPage.includes('Hidden Page'));
});

test('listPages includes a link to request testing a new page', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const testLink = html.querySelector('a[href="requestNewTestForm.html"]');
  assert.ok(testLink);
});

test('listPages shows requests when testRequests.json has entries', {timeout: 500}, async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const testRequestsPath = path.join(dbDir, 'jobs', 'testRequests.json');
  const originalTestRequests = await fs.readFile(testRequestsPath, 'utf8');
  try {
    const testRequests = {
      'https://example.com/mixed': [
        {description: 'Mixed Outcomes', reason: 'Needs retesting for accessibility'}
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

test('listPages shows queued and claimed jobs when they exist', async () => {
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

test('listPages lists a page whose report is not usable', {timeout: 500}, async () => {
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
    assert.equal(result.status, 'ok');
    const links = getPageLinks(result.answerPage);
    assert.ok(links.some(a => a.text === 'Invalid Report'));
  }
  finally {
    await fs.unlink(invalidReportPath).catch(() => {});
  }
});

test('listPages shows no-reports message when the database is empty', async () => {
  // Create a temp DB with empty reports and jobs directories.
  const os = await import('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listpages-empty-'));
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
    assert.ok(result.answerPage.includes('<p>No pages have been tested yet.</p>'));
    assert.ok(!result.answerPage.includes('Get test results for:'));
    assert.equal(getPageLinks(result.answerPage).length, 0);
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});
