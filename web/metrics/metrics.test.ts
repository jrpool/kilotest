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

test('metrics returns an error for an invalid auth code on a POST request', async () => {
  const result: any = await answer(null, 'authCode=wrong', 'POST');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid request');
});

test('metrics displays a form requesting an auth code on a GET request', async () => {
  const result: any = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const input = html.querySelector('input[name="authCode"]');
  assert.ok(input);
  assert.equal(html.querySelectorAll('table').length, 0);
});

test('metrics displays a clearCounts checkbox in the initial form', async () => {
  const result: any = await answer(null, '', 'GET');
  const html = parse(result.answerPage);
  const checkbox = html.querySelector('input[name="clearCounts"]');
  assert.ok(checkbox);
  assert.equal(checkbox.getAttribute('type'), 'checkbox');
});

test('metrics submits its form as a POST', async () => {
  const result: any = await answer(null, '', 'GET');
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.equal(form?.getAttribute('method'), 'post');
});

test('metrics ignores a valid authCode query string on a GET request', async () => {
  const result: any = await answer(null, 'authCode=test-auth-code', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  // The form (not the counts) should still be shown, since only POST submits.
  assert.ok(html.querySelector('input[name="authCode"]'));
  assert.equal(html.querySelectorAll('table').length, 0);
});

test('metrics ignores clearCounts on a GET request, even with a valid authCode', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {tutorialWeb: 9},
    mcpToolCalls: {},
    apiOperations: {},
    managerActivity: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code&clearCounts=on', 'GET');
  assert.ok(!result.answerPage.includes('Counts cleared.'));
  const metrics = JSON.parse(await fs.readFile(metricsPath(), 'utf8'));
  // The counts should NOT have been cleared by a mere GET request.
  assert.equal(metrics.pageViews.tutorialWeb, 9);
  await fs.rm(metricsPath(), {force: true});
});

test('metrics reports no counts yet when the metrics file does not exist', async () => {
  await fs.rm(metricsPath(), {force: true});
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Counts recorded since'));
  const html = parse(result.answerPage);
  assert.equal(html.querySelectorAll('table').length, 0);
  await fs.rm(metricsPath(), {force: true});
});

test('metrics reports recorded counts with a valid auth code on a POST request', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {tutorialWeb: 3},
    mcpToolCalls: {listReports: 5},
    apiOperations: {},
    managerActivity: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
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
    pageViews: {manage: 1, tutorialWeb: 9, otherPage: 4},
    mcpToolCalls: {},
    apiOperations: {},
    managerActivity: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  const html = parse(result.answerPage);
  const names = html.querySelectorAll('table')[0]!.querySelectorAll('tbody td:first-child')
  .map(cell => cell.text);
  assert.deepEqual(names, ['tutorialWeb', 'otherPage', 'manage']);
  await fs.rm(metricsPath(), {force: true});
});

test('metrics reports manager page activity, sorted by descending failure count', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {},
    mcpToolCalls: {},
    apiOperations: {},
    managerActivity: {
      metrics: {ok: 5, error: 0},
      reannotate: {ok: 1, error: 8}
    }
  }));
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  assert.ok(result.answerPage.includes('Manager page activity'));
  const html = parse(result.answerPage);
  const tables = html.querySelectorAll('table');
  assert.equal(tables.length, 1);
  const managerTable = tables[0]!;
  const rows = managerTable.querySelectorAll('tbody tr').map(row =>
    row.querySelectorAll('td').map(cell => cell.text)
  );
  assert.deepEqual(rows, [['reannotate', '1', '8'], ['metrics', '5', '0']]);
  await fs.rm(metricsPath(), {force: true});
});

test('metrics reports no manager activity yet when none has been recorded', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {},
    mcpToolCalls: {},
    apiOperations: {},
    managerActivity: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  const html = parse(result.answerPage);
  assert.equal(html.querySelectorAll('table').length, 0);
  assert.ok(result.answerPage.includes('None yet.'));
  await fs.rm(metricsPath(), {force: true});
});

test('metrics clears all counts and shows a confirmation when clearCounts is submitted via POST', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {tutorialWeb: 9},
    mcpToolCalls: {listReports: 3},
    apiOperations: {getReport: 1},
    managerActivity: {reannotate: {ok: 1, error: 2}}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code&clearCounts=on', 'POST');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Counts cleared.'));
  const html = parse(result.answerPage);
  assert.equal(html.querySelectorAll('table').length, 0);
  const metrics = JSON.parse(await fs.readFile(metricsPath(), 'utf8'));
  assert.deepEqual(metrics.pageViews, {});
  assert.deepEqual(metrics.mcpToolCalls, {});
  assert.deepEqual(metrics.apiOperations, {});
  assert.deepEqual(metrics.managerActivity, {});
  assert.notEqual(metrics.since, '260101T0000');
  await fs.rm(metricsPath(), {force: true});
});

test('metrics does not clear counts, and does not show a confirmation, when clearCounts is not submitted', async () => {
  await fs.writeFile(metricsPath(), getJSON({
    since: '260101T0000',
    pageViews: {tutorialWeb: 9},
    mcpToolCalls: {},
    apiOperations: {},
    managerActivity: {}
  }));
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  assert.ok(!result.answerPage.includes('Counts cleared.'));
  const metrics = JSON.parse(await fs.readFile(metricsPath(), 'utf8'));
  assert.equal(metrics.pageViews.tutorialWeb, 9);
  await fs.rm(metricsPath(), {force: true});
});
