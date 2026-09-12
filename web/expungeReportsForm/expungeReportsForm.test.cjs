/*
  expungeReportsForm.test.cjs
  Unit tests for web/expungeReportsForm/index.ts.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs/promises');
const {parse} = require('node-html-parser');
const {answer} = require('./index.cts');
const {reportsPath} = require('../../util.ts');

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
const fixtureDBDir = require('../../test/dbFixture.cjs').fixtureDBDir;

before(() => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
});

after(async () => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('expungeReportsForm displays a list of reports when no submission', async () => {
  const result = await answer(null, '');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('expungeReportsForm returns an error for an invalid auth code', async () => {
  const result = await answer(null, 'authCode=wrong&report=260101T0001-ct');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('expungeReportsForm returns an error when deleting a nonexistent report', async () => {
  const result = await answer(null, 'authCode=test-auth-code&report=999999T9999-nope');
  assert.equal(result.status, 'error');
  assert.ok(result.message.includes('Deleting sole reports'));
});

test('expungeReportsForm deletes a sole report with valid auth code', async () => {
  // 260101T0001-ct is the only report for its URL (canttell).
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const result = await answer(null, 'authCode=test-auth-code&report=260101T0001-ct');
    assert.equal(result.status, 'ok');
    await fs.access(reportPath).then(
      () => {throw new Error('Report should have been deleted');},
      () => {}
    );
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('expungeReportsForm returns an error when a report file is corrupt', async () => {
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    await fs.writeFile(reportPath, 'not valid json');
    const result = await answer(null, '');
    assert.equal(result.status, 'error');
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('expungeReportsForm shows no-deletable message when every URL has at least 2 reports', async () => {
  // Create a temp DB with two reports sharing the same URL.
  const os = require('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'expunge-test-'));
  const tmpReports = path.join(tmpDir, 'reports');
  await fs.mkdir(tmpReports);
  // Copy two reports that share the same URL.
  const mixReport = await fs.readFile(path.join(fixtureDBDir, 'reports', '260101T0000-mix.json'), 'utf8');
  const newReport = await fs.readFile(path.join(fixtureDBDir, 'reports', '260202T0000-new.json'), 'utf8');
  await fs.writeFile(path.join(tmpReports, '260101T0000-mix.json'), mixReport);
  await fs.writeFile(path.join(tmpReports, '260202T0000-new.json'), newReport);
  const savedDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    delete require.cache[require.resolve('./index.cts')];
    const {answer} = require('./index.cts');
    const result = await answer(null, '');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('no reports to delete'));
    assert.ok(result.answerPage.includes('disabled'));
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    delete require.cache[require.resolve('./index.cts')];
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});
