/*
  reannotate.test.js
  Unit tests for web/reannotate/index.js, covering the reannotation logic branches.
*/

// IMPORTS

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {parse} = require('node-html-parser');

// CONSTANTS

const fixtureDBDir = path.join(__dirname, '..', '..', 'test', 'fixtures', 'db');
const reportsDir = path.join(fixtureDBDir, 'reports');

// SETUP AND TEARDOWN

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  process.env.AUTH_CODE = 'test-auth-code';
});

beforeEach(async () => {
  // Ensure DB_DIR points to the fixture DB for each test.
  process.env.DB_DIR = fixtureDBDir;
});

after(async () => {
  // Restore DB_DIR to the fixture DB.
  process.env.DB_DIR = fixtureDBDir;
});

// HELPER

// Backs up all report files and returns a map of fileName to content.
const backupReports = async () => {
  const reportFiles = await fs.readdir(reportsDir);
  const backups = {};
  for (const file of reportFiles) {
    backups[file] = await fs.readFile(path.join(reportsDir, file), 'utf8');
  }
  return backups;
};

// Restores all report files from a backup map.
const restoreReports = async backups => {
  for (const [file, content] of Object.entries(backups)) {
    await fs.writeFile(path.join(reportsDir, file), content);
  }
};

// TESTS

test('answer returns an error for an invalid authorization code', async () => {
  const {answer} = require('./index');
  const result = await answer('wrong-code');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('answer returns an error when no reports are available', async () => {
  // Create a temporary DB directory with an empty reports directory.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reannotate-test-'));
  await fs.mkdir(path.join(tempDir, 'reports'));
  const originalDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tempDir;
  try {
    // Re-require the module so it picks up the new DB_DIR.
    delete require.cache[require.resolve('./index')];
    const {answer} = require('./index');
    const result = await answer('test-auth-code');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Got data on no available reports');
  }
  finally {
    process.env.DB_DIR = originalDBDir;
    try {
      await fs.rm(tempDir, {recursive: true});
    }
    catch {
      // Ignore cleanup errors for the temp directory.
    }
  }
});

test('answer returns an error when a report fails annotation', async () => {
  // Back up all fixture reports, because annotateReport modifies good reports
  // in place before it reaches the bad one and returns an error.
  const backups = await backupReports();
  // Create a temporary report file that passes getReportExtract but fails
  // getReport validation (acts is not an array).
  const badReportName = '990101T0000-bad.json';
  const badReportPath = path.join(reportsDir, badReportName);
  const badReport = {
    id: '990101T0000-bad',
    target: {what: 'Bad Report', url: 'https://example.com/bad'},
    acts: 'not-an-array',
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await fs.writeFile(badReportPath, JSON.stringify(badReport));
  try {
    delete require.cache[require.resolve('./index')];
    const {answer} = require('./index');
    const result = await answer('test-auth-code');
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('invalid'), `Expected message about invalid report, got: ${result.message}`);
  }
  finally {
    try {
      await fs.unlink(badReportPath);
    }
    catch {
      // Ignore cleanup errors for the temporary bad report.
    }
    // Restore all fixture reports modified by annotateReport.
    await restoreReports(backups);
  }
});

test('answer returns ok with an answer page when all reports annotate successfully', async () => {
  // Back up all fixture reports, because annotateReport modifies them in place.
  const backups = await backupReports();
  try {
    delete require.cache[require.resolve('./index')];
    const {answer} = require('./index');
    const result = await answer('test-auth-code');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage, 'answerPage should be present');
    // Verify the HTML is well-formed.
    const doc = parse(result.answerPage);
    const h1 = doc.querySelector('h1');
    assert.ok(h1);
    assert.ok(h1.textContent.includes('Reannotation order'));
  }
  finally {
    // Restore all fixture reports.
    await restoreReports(backups);
  }
});
