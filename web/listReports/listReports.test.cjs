/*
  listReports.test.cjs
  UI tests for web/listReports/index.ts using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {parse} = require('node-html-parser');
const {answer} = require('./index.cts');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
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
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title').text, 'Pages tested | Kilotest');
});

test('listReports includes the 8 non-hidden fixture reports as details elements', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const details = html.querySelectorAll('details');
  assert.equal(details.length, 8);
});

test('listReports includes the page descriptions in summary elements', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const summaries = html.querySelectorAll('details > summary').map(s => s.text);
  assert.ok(summaries.some(s => s.startsWith('Mixed Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('All CantTell Page')));
  assert.ok(summaries.some(s => s.startsWith('No Outcomes Page')));
  assert.ok(summaries.some(s => s.startsWith('Empty Results Page')));
  assert.ok(summaries.some(s => s.startsWith('Prevented Page')));
});

test('listReports does not include the hidden report', async () => {
  const result = await answer();
  assert.ok(!result.answerPage.includes('Hidden Page'));
});

test('listReports includes links to listIssues for reports with issues', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const issueLinks = html.querySelectorAll('a[href*="listIssues.html"]');
  assert.ok(issueLinks.length > 0);
  const hrefs = issueLinks.map(a => a.getAttribute('href'));
  assert.ok(hrefs.some(href => href.includes('260101T0000/mix')));
});

test('listReports includes the page URLs in the report details', async () => {
  const result = await answer();
  assert.ok(result.answerPage.includes('https://example.com/mixed'));
  assert.ok(result.answerPage.includes('https://example.com/canttell'));
});

test('listReports includes a link to request testing a new page', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const testLink = html.querySelector('a[href="requestTestForm.html"]');
  assert.ok(testLink);
});

test('listReports shows recommendations when recs.json has entries', {timeout: 500}, async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const recsPath = path.join(dbDir, 'jobs', 'recs.json');
  const originalRecs = await fs.readFile(recsPath, 'utf8');
  try {
    const testRecs = {
      'https://example.com/mixed': [
        {what: 'Mixed Outcomes Page', why: 'Needs retesting for accessibility'}
      ]
    };
    await fs.writeFile(recsPath, JSON.stringify(testRecs, null, 2));
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('https://example.com/mixed'));
    assert.ok(result.answerPage.includes('Needs retesting for accessibility'));
  }
  finally {
    await fs.writeFile(recsPath, originalRecs);
  }
});

test('listReports shows queued and claimed jobs when they exist', async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
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
    const result = await answer();
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
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const claimedDir = path.join(dbDir, 'jobs', 'claimed');
  const claimedFile = path.join(claimedDir, 'claimedRetest.json');
  try {
    const claimedJob = {
      target: {url: 'https://example.com/mixed', what: 'Mixed Outcomes Page'}
    };
    await fs.writeFile(claimedFile, JSON.stringify(claimedJob, null, 2));
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Currently being retested'));
  }
  finally {
    await fs.unlink(claimedFile).catch(() => {});
  }
});

test('listReports shows queued retest status for a report with a matching queued job', async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const queueDir = path.join(dbDir, 'jobs', 'queue');
  const queueFile = path.join(queueDir, 'queuedRetest.json');
  try {
    const queuedJob = {
      target: {url: 'https://example.com/mixed', what: 'Mixed Outcomes Page'}
    };
    await fs.writeFile(queueFile, JSON.stringify(queuedJob, null, 2));
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('Currently in the queue for retesting'));
  }
  finally {
    await fs.unlink(queueFile).catch(() => {});
  }
});

test('listReports returns an error when a report file is invalid', {timeout: 500}, async () => {
  const dbDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
  const reportsDir = path.join(dbDir, 'reports');
  const invalidReportPath = path.join(reportsDir, '260101T9999-bad.json');
  try {
    // Valid for getReportExtract (has target and jobData.endTime) but invalid for isValidReport (no acts or catalog).
    const invalidReport = {
      target: {what: 'Invalid Report', url: 'https://example.com/invalid'},
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

test('listReports shows no-reports message when the database is empty', async () => {
  // Create a temp DB with empty reports and jobs directories.
  const os = require('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listreports-empty-'));
  await fs.mkdir(path.join(tmpDir, 'reports'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'queue'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'claimed'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'failed'), {recursive: true});
  await fs.writeFile(path.join(tmpDir, 'jobs', 'recs.json'), '{}\n');
  const savedDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    delete require.cache[require.resolve('./index.cts')];
    const {answer} = require('./index.cts');
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('no'));
    assert.ok(result.answerPage.includes(' a '));
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    delete require.cache[require.resolve('./index.cts')];
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});
