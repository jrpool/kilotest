/*
  expungeReportsForm.test.ts
  Unit tests for web/expungeReportsForm/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {reportsPath} from '../../util.ts';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
import {fixtureDBDir} from '../../test/dbFixture.ts';

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

test('expungeReportsForm displays a list of reports on a GET request', async () => {
  const result: any = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('expungeReportsForm ignores a report query string on a GET request', async () => {
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const result: any = await answer(null, 'authCode=test-auth-code&report=260101T0001-ct', 'GET');
  assert.equal(result.status, 'ok');
  // The report should NOT have been deleted by a mere GET request.
  await fs.access(reportPath);
});

test('expungeReportsForm returns an error for an invalid auth code on a POST request', async () => {
  const result: any = await answer(null, 'authCode=wrong&report=260101T0001-ct', 'POST');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid request');
});

test('expungeReportsForm deletes nothing and says why when a submitted report is not deletable', async () => {
  // 999999T9999-nope does not exist, and 260101T0000-mix and 260202T0000-new are never both deletable with this form.
  for (const reports of [['999999T9999-nope'], ['260101T0000-mix', '260202T0000-new']]) {
    const search = `authCode=test-auth-code&${reports.map(report => `report=${report}`).join('&')}`;
    const result: any = await answer(null, search, 'POST');
    assert.equal(result.status, 'ok');
    const alert = parse(result.answerPage as string).querySelector('[role="alert"]')?.text ?? '';
    assert.match(alert, /^Nothing was deleted, because report \S+ is not deletable with this form\./);
    await fs.access(path.join(reportsPath(), '260101T0000-mix.json'));
    await fs.access(path.join(reportsPath(), '260202T0000-new.json'));
  }
});

test('expungeReportsForm deletes a sole report with valid auth code on a POST request', async () => {
  // 260101T0001-ct is the only report for its URL (canttell).
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const result: any = await answer(null, 'authCode=test-auth-code&report=260101T0001-ct', 'POST');
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
    const result: any = await answer(null, '', 'GET');
    assert.equal(result.status, 'error');
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('expungeReportsForm shows no-deletable message when every URL has at least 2 reports', async () => {
  // Create a temp DB with two reports sharing the same URL.
  const os = await import('node:os');
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
    const {answer} = await import('./index.ts');
    const result: any = await answer(null, '', 'GET');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('no reports to delete'));
    assert.ok(result.answerPage.includes('disabled'));
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});

test('expungeReportsForm shows a sole report with no page identifier or names as unregistered', async () => {
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const report = JSON.parse(backup);
    delete report.sources;
    await fs.writeFile(reportPath, JSON.stringify(report));
    const result: any = await answer(null, '', 'GET');
    const group = parse(result.answerPage).querySelectorAll('fieldset')
    .find(fieldset => fieldset.querySelector('input[value="260101T0001-ct"]'));
    assert.equal(group?.querySelector('legend')?.text, 'page with no identifier');
    const lines = group?.querySelectorAll('p').map(line => line.text) ?? [];
    assert.equal(lines[0], 'Not now registered.');
    assert.ok(lines[1]?.includes(`tested as “${report.target.what}” at ${report.target.url};`));
    // The page with 2 reports has no sole report, so it is omitted.
    assert.equal(parse(result.answerPage).querySelector('input[value="260101T0000-mix"]'), null);
    assert.ok(!result.answerPage.includes('260202T0000-new'));
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});
