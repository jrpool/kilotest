/*
  requestPageTestForm.test.ts
  Unit tests for web/requestPageTestForm/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {fixtureDBDir} from '../../test/dbFixture.ts';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
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

test('requestPageTestForm serves a form posting to the request page of the site', async () => {
  const result: any = await answer('s-fixtur');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Test request for a page of Fixture Site | Kilotest');
  assert.equal(html.querySelector('form')?.getAttribute('action'), '/requestPageTest.html/s-fixtur');
  assert.deepEqual(html.querySelectorAll('input').map(input => input.getAttribute('name')), ['pageName', 'url', 'why']);
  assert.ok(html.querySelector('a[href="/listPages.html/s-fixtur"]'));
});

test('requestPageTestForm refuses a nonexistent or malformed site', async () => {
  for (const siteID of ['s-zzzzzz', 'nonsense']) {
    assert.deepEqual(await answer(siteID), {status: 'error', message: 'Request for a nonexistent site'});
  }
});
