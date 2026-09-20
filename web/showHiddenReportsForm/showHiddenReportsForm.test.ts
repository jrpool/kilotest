/*
  showHiddenReportsForm.test.ts
  Unit tests for web/showHiddenReportsForm/index.ts.
*/

// IMPORTS

import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {reportsPath, hiddenReportsPath} from '../../util.ts';

// CONSTANTS

const hiddenFile = '260101T0007-hid.json';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
import {fixtureDBDir} from '../../test/dbFixture.ts';

const getPaths = () => ({
  hidden: path.join(hiddenReportsPath(), hiddenFile),
  report: path.join(reportsPath(), hiddenFile)
});

before(() => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
});

beforeEach(async () => {
  // Ensure the hidden report is in the hidden directory before each test.
  const {hidden, report} = getPaths();
  try {
    await fs.rename(report, hidden);
  }
  catch {
    // Report may already be hidden.
  }
});

after(async () => {
  // Restore the hidden report if it was moved.
  const {hidden, report} = getPaths();
  try {
    await fs.rename(report, hidden);
  }
  catch {
    // Report may already be hidden.
  }
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('showHiddenReportsForm displays a bare authCode form on a GET request, disclosing nothing', async () => {
  const result: any = await answer(null, '', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('input[name="authCode"]'));
  assert.equal(html.querySelectorAll('input[type="radio"]').length, 0);
  assert.ok(!result.answerPage.includes('260101T0007-hid'));
});

test('showHiddenReportsForm submits its form as a POST', async () => {
  const result: any = await answer(null, '', 'GET');
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.equal(form?.getAttribute('method'), 'post');
});

test('showHiddenReportsForm ignores a valid authCode query string on a GET request', async () => {
  const result: any = await answer(null, 'authCode=test-auth-code', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('input[name="authCode"]'));
  assert.equal(html.querySelectorAll('input[type="radio"]').length, 0);
});

test('showHiddenReportsForm returns an error for an invalid auth code on a POST request', async () => {
  const result: any = await answer(null, 'authCode=wrong', 'POST');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('showHiddenReportsForm serves the hidden reports list on a POST request with a valid auth code', async () => {
  const result: any = await answer(null, 'authCode=test-auth-code', 'POST');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const radios = html.querySelectorAll('input[type="radio"]');
  assert.ok(radios.length > 0);
  assert.ok(result.answerPage.includes('260101T0007-hid'));
});
