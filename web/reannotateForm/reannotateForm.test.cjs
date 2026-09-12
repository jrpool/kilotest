/*
  reannotateForm.test.cjs
  Unit tests for web/reannotateForm/index.ts, covering error, no-reclassified,
  and success branches of answer and populateQuery.
*/

// IMPORTS

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {parse} = require('node-html-parser');

// CONSTANTS

const fixtureDBDir = require('../../test/dbFixture.cjs').fixtureDBDir;
const reportsDir = path.join(fixtureDBDir, 'reports');
const emptyReportName = '260101T0005-emp.json';

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

// TESTS

test('answer returns ok with reclassified rules listed in the page', async () => {
  // The fixture reports have instances whose issueIDs differ from the
  // current rule specs, so reclassified rules should be listed.
  delete require.cache[require.resolve('./index.cts')];
  const {answer} = require('./index.cts');
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the placeholders were replaced.
  assert.ok(!result.answerPage.includes('__how__'));
  assert.ok(!result.answerPage.includes('__reannotateForm__'));
  assert.ok(!result.answerPage.includes('__stillUnclassified__'));
  assert.ok(!result.answerPage.includes('__reClassified__'));
  // Verify the how text mentions reclassified rules.
  assert.ok(result.answerPage.includes('reclassified'));
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('Reannotation order'));
  // Verify the form is present.
  const form = doc.querySelector('form');
  assert.ok(form);
  assert.equal(form.getAttribute('action'), '/reannotate.html');
});

test('answer returns ok with no-reclassified message when reports have no violations', async () => {
  // Create a temporary DB directory with only the empty report (no instances).
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reannotateForm-test-'));
  const tempReportsDir = path.join(tempDir, 'reports');
  await fs.mkdir(tempReportsDir);
  // Copy the empty report (no standard instances) to the temp directory.
  const emptyReportContent = await fs.readFile(path.join(reportsDir, emptyReportName), 'utf8');
  await fs.writeFile(path.join(tempReportsDir, emptyReportName), emptyReportContent);
  const originalDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tempDir;
  try {
    delete require.cache[require.resolve('./index.cts')];
    const {answer} = require('./index.cts');
    const result = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage, 'answerPage should be present');
    // Verify the how text says reannotation is normally not necessary.
    assert.ok(
      result.answerPage.includes('normally not necessary'),
      'Expected the no-reclassified message in the answer page'
    );
    // Verify no reclassified list items are present.
    assert.ok(!result.answerPage.includes('reclassified</q> rule indicates'));
    // Verify the HTML is well-formed.
    const doc = parse(result.answerPage);
    const form = doc.querySelector('form');
    assert.ok(form);
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

test('answer returns an error when a report fails to load', async () => {
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
    delete require.cache[require.resolve('./index.cts')];
    const {answer} = require('./index.cts');
    const result = await answer();
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
  }
});
