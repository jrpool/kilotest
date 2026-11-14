/*
  pruneReportsForm.test.ts
  Unit tests for web/pruneReportsForm/index.ts.
*/

// IMPORTS

import {mock, test, before, after} from 'node:test';
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

test('pruneReportsForm displays a list of reports on a GET request', async () => {
  const result = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('pruneReportsForm ignores a report query string on a GET request', async () => {
  const reportPath = path.join(reportsPath(), '260101T0000-mix.json');
  const result = await answer(null, 'authCode=test-auth-code&report=260101T0000-mix', 'GET');
  assert.equal(result.status, 'ok');
  // The report should NOT have been deleted by a mere GET request.
  await fs.access(reportPath);
});

test('pruneReportsForm returns an error for an invalid auth code on a POST request', async () => {
  const result = await answer(null, 'authCode=wrong&report=260101T0000-mix', 'POST');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid request');
});

test('pruneReportsForm deletes nothing and says why when a submitted report is not deletable', async () => {
  // 999999T9999-nope does not exist, and 260101T0000-mix and 260202T0000-new are never both deletable with this form.
  for (const reports of [['999999T9999-nope'], ['260101T0000-mix', '260202T0000-new']]) {
    const search = `authCode=test-auth-code&${reports.map(report => `report=${report}`).join('&')}`;
    const result = await answer(null, search, 'POST');
    assert.equal(result.status, 'ok');
    const alert = parse(result.answerPage as string).querySelector('[role="alert"]')?.text ?? '';
    assert.match(alert, /^Nothing was deleted, because report \S+ is not deletable with this form\./);
    await fs.access(path.join(reportsPath(), '260101T0000-mix.json'));
    await fs.access(path.join(reportsPath(), '260202T0000-new.json'));
  }
});

test('pruneReportsForm deletes a superseded report with valid auth code on a POST request', async () => {
  // 260101T0000-mix is superseded by 260202T0000-new (same URL).
  const reportPath = path.join(reportsPath(), '260101T0000-mix.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const result = await answer(null, 'authCode=test-auth-code&report=260101T0000-mix', 'POST');
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

test('pruneReportsForm shows only the pages with a deletable report, each with all its reports and registrations', async () => {
  const result = await answer(null, '', 'GET');
  const groups = parse(result.answerPage as string).querySelectorAll('fieldset');
  // Only the page with 2 reports has a superseded report.
  assert.equal(groups.length, 1);
  const group = groups[0]!;
  assert.equal(group.querySelector('legend')?.text, 'page p-mixedout');
  const lines = group.querySelectorAll('p').map(line => line.text);
  assert.deepEqual(lines, [
    'Now registered as “Fixture Site Mixed Outcomes” at https://example.com/mixed.',
    ' 260101T0000-mix: tested as “Fixture Site Mixed Outcomes” at https://example.com/mixed; preventions 0, issues 2',
    '260202T0000-new: tested as “Fixture Site Mixed Outcomes” at https://example.com/mixed; preventions 0, issues 1'
  ]);
  // The deletable report has a labeled checkbox, and the other report has none.
  assert.ok(group.querySelector('label input[type="checkbox"][value="260101T0000-mix"]'));
  assert.equal(group.querySelectorAll('input').length, 1);
});

test('pruneReportsForm treats reports about one page as reports about one target even if their URLs differ', async () => {
  // 260202T0000-new is about the same page as 260101T0000-mix.
  const reportPath = path.join(reportsPath(), '260202T0000-new.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    const report = JSON.parse(backup);
    report.target.url = 'https://example.com/mixed-revised';
    await fs.writeFile(reportPath, JSON.stringify(report));
    const result = await answer(null, '', 'GET');
    const html = parse(result.answerPage as string);
    assert.ok(html.querySelector('input[value="260101T0000-mix"]'));
    assert.equal(html.querySelector('input[value="260202T0000-new"]'), null);
    // A report with no page identifier is about its URL, so it supersedes no report with a different URL.
    delete report.sources.pageID;
    await fs.writeFile(reportPath, JSON.stringify(report));
    const orphanResult = await answer(null, '', 'GET');
    assert.equal(parse(orphanResult.answerPage as string).querySelector('input[value="260101T0000-mix"]'), null);
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('pruneReportsForm returns an error when a deletion fails', async () => {
  const unlink = mock.method(fs, 'unlink', async () => {
    throw new Error('simulated failure');
  });
  try {
    const result = await answer(null, 'authCode=test-auth-code&report=260101T0000-mix', 'POST');
    assert.deepEqual(result, {status: 'error', message: 'Deleting superseded reports failed (simulated failure)'});
  }
  finally {
    unlink.mock.restore();
  }
});

test('pruneReportsForm returns an error when a report file is corrupt', async () => {
  const reportPath = path.join(reportsPath(), '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  try {
    await fs.writeFile(reportPath, 'not valid json');
    const result = await answer(null, '', 'GET');
    assert.equal(result.status, 'error');
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});
