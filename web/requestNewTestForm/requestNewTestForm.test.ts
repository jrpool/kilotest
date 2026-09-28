/*
  requestNewTestForm.test.ts
  Unit tests for web/requestNewTestForm/index.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';

// TESTS

test('requestNewTestForm returns an ok status with valid HTML', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Test request | Kilotest');
});

test('requestNewTestForm includes a form that posts to /requestNewTest.html', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.ok(form);
  assert.equal(form.getAttribute('action'), '/requestNewTest.html');
  assert.equal(form.getAttribute('method'), 'post');
});

test('requestNewTestForm includes required inputs for description, url, and why', async () => {
  const result = await answer();
  const html = parse(result.answerPage);
  const inputs = html.querySelectorAll('input');
  const names = inputs.map(input => input.getAttribute('name'));
  assert.ok(names.includes('description'));
  assert.ok(names.includes('url'));
  assert.ok(names.includes('why'));
});
