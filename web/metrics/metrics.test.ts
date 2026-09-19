/*
  metrics.test.ts
  Unit tests for web/metrics/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {getJSON, metricsPath} from '../../util.ts';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
import {fixtureDBDir} from '../../test/dbFixture.ts';

before(() => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
});

after(() => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('metrics returns an error for an invalid auth code', async () => {
  const result: any = await answer(null, 'authCode=wrong');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('metrics displays a form requesting an auth code when none has been submitted', async () => {
  const result: any = await answer(null, '');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const input = html.querySelector('input[name="authCode"]');
  assert.ok(input);
  assert.equal(html.querySelectorAll('table').length, 0);
});

test('metrics reports no counts yet when the metrics file does not exist', async () => {
  await fs.rm(metricsPath(), {force: true});
  const result: any = await answer(null, 'authCode=test-auth-code');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('not yet available'));
  const html = parse(result.answerPage);
  assert.equal(html.querySelectorAll('table').length, 0);
});

test('metrics reports recorded counts with a valid auth code', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {tutorialWeb: 3, manage: 1},
    mcpToolCalls: {listReports: 5},
    apiOperations: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const tables = html.querySelectorAll('table');
  assert.equal(tables.length, 2);
  assert.ok(result.answerPage.includes('tutorialWeb'));
  assert.ok(result.answerPage.includes('5'));
  assert.ok(result.answerPage.includes('at 00:00'));
  await fs.rm(metricsPath(), {force: true});
});

test('metrics sorts each category by descending count', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {manage: 1, tutorialWeb: 9, metrics: 4},
    mcpToolCalls: {},
    apiOperations: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code');
  const html = parse(result.answerPage);
  const names = html.querySelectorAll('table')[0]!.querySelectorAll('tbody td:first-child')
  .map(cell => cell.text);
  assert.deepEqual(names, ['tutorialWeb', 'metrics', 'manage']);
  await fs.rm(metricsPath(), {force: true});
});
