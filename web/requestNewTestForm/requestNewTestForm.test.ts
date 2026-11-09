/*
  requestNewTestForm.test.ts
  Unit tests for web/requestNewTestForm/index.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {fixtureDBDir} from '../../test/dbFixture.ts';

process.env.DB_DIR = fixtureDBDir;

// TESTS

test('requestNewTestForm returns an ok status with valid HTML', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Test request | Kilotest');
});

test('requestNewTestForm includes a form that posts to /requestNewTest.html', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const form = html.querySelector('form');
  assert.ok(form);
  assert.equal(form.getAttribute('action'), '/requestNewTest.html');
  assert.equal(form.getAttribute('method'), 'post');
});

test('requestNewTestForm includes required inputs for siteName, pageName, url, and why', async () => {
  const result: any = await answer();
  const html = parse(result.answerPage);
  const inputs = html.querySelectorAll('input');
  const names = inputs.map(input => input.getAttribute('name'));
  assert.ok(names.includes('siteName'));
  assert.ok(names.includes('pageName'));
  assert.ok(names.includes('url'));
  assert.ok(names.includes('why'));
});

test('requestNewTestForm for an existing site fixes the site and omits the site-name input', async () => {
  const result: any = await answer('s-fixtur');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Test request for a page of Fixture Site | Kilotest');
  assert.deepEqual(html.querySelectorAll('input').map(input => input.getAttribute('name')), ['siteID', 'pageName', 'url', 'why']);
  assert.equal(html.querySelector('input[name="siteID"]')?.getAttribute('value'), 's-fixtur');
  assert.ok(html.querySelector('a[href="/listPages.html/s-fixtur"]'));
});

test('requestNewTestForm refuses a nonexistent or malformed site', async () => {
  for (const siteID of ['s-zzzzzz', 'nonsense']) {
    assert.deepEqual(await answer(siteID), {status: 'error', message: 'Request for a nonexistent site'});
  }
});
