// Not yet under strict type checking (transitional).
// @ts-nocheck
/*
  requestTestForm.test.ts
  Unit tests for web/requestTestForm/index.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';

// TESTS

test('requestTestForm returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title').text, 'Test recommendation | Kilotest');
});

test('requestTestForm includes a form that posts to /requestTest.html', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.ok(form);
  assert.equal(form.getAttribute('action'), '/requestTest.html');
  assert.equal(form.getAttribute('method'), 'post');
});

test('requestTestForm includes required inputs for what, url, and why', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const inputs = html.querySelectorAll('input');
  const names = inputs.map(input => input.getAttribute('name'));
  assert.ok(names.includes('what'));
  assert.ok(names.includes('url'));
  assert.ok(names.includes('why'));
});
