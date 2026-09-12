// @ts-nocheck: transitional (not yet under strict type checking).
/*
  requestRetestForm.test.ts
  Unit tests for web/requestRetestForm/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../../test/dbFixture.ts')).fixtureDBDir;
});

after(() => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('requestRetestForm returns ok with the page name for a valid report', async () => {
  const result = await answer('260202T0000/new');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  const title = html.querySelector('title').text;
  assert.ok(title.includes('Mixed Outcomes Page'));
});

test('requestRetestForm populates the form action with the timeStamp and jobID', async () => {
  const result = await answer('260202T0000/new');
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.equal(form.getAttribute('action'), '/requestRetest.html/260202T0000/new');
});

test('requestRetestForm shows the fallback message for a nonexistent report', async () => {
  const result = await answer('999999T9999/nope');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('The specified page is not available for retesting'));
});

test('requestRetestForm includes the ago and dateTime placeholders replaced', async () => {
  const result = await answer('260202T0000/new');
  assert.ok(!result.answerPage.includes('__ago__'));
  assert.ok(!result.answerPage.includes('__dateTime__'));
  assert.ok(!result.answerPage.includes('__target__'));
  assert.ok(!result.answerPage.includes('__timeStamp__'));
  assert.ok(!result.answerPage.includes('__jobID__'));
});
