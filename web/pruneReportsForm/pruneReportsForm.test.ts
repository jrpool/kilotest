/*
  pruneReportsForm.test.ts
  Unit tests for web/pruneReportsForm/index.ts.
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

test('pruneReportsForm returns an error when deleting a nonexistent report on a POST request', async () => {
  const result = await answer(null, 'authCode=test-auth-code&report=999999T9999-nope', 'POST');
  assert.equal(result.status, 'error');
  assert.ok(result.message?.includes('Deleting superseded reports'));
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
