/*
  hideReportForm.test.ts
  Unit tests for web/hideReportForm/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {reportsPath, hiddenReportsPath} from '../../util.ts';

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
  // Restore any moved report.
  const reportFile = path.join(hiddenReportsPath(), '260101T0009-brd.json');
  const originalPath = path.join(reportsPath(), '260101T0009-brd.json');
  try {
    await fs.rename(reportFile, originalPath);
  }
  catch {
    // Report may already be in place.
  }
});

// TESTS

test('hideReportForm displays a list of reports when no submission', async () => {
  const result: any = await answer(null, '');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  const radios = html.querySelectorAll('input[type="radio"]');
  assert.ok(radios.length > 0);
});

test('hideReportForm returns an error for an invalid auth code', async () => {
  const result: any = await answer(null, 'authCode=wrong&report=260101T0009-brd');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('hideReportForm hides a report with valid auth code', async () => {
  const reportPath = path.join(reportsPath(), '260101T0009-brd.json');
  const hiddenPath = path.join(hiddenReportsPath(), '260101T0009-brd.json');
  // Ensure the report exists in reports and not in hidden.
  try {
    await fs.rename(hiddenPath, reportPath);
  }
  catch {
    // Report may already be in reports.
  }
  const result: any = await answer(null, 'authCode=test-auth-code&report=260101T0009-brd');
  assert.equal(result.status, 'ok');
  // The report should now be in the hidden directory.
  await fs.access(hiddenPath);
});

test('hideReportForm returns an error when hiding a nonexistent report', async () => {
  const result: any = await answer(null, 'authCode=test-auth-code&report=999999T9999-nope');
  assert.equal(result.status, 'error');
  assert.ok(result.message.includes('Hiding report'));
});
