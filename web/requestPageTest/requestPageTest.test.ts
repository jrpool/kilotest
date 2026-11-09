/*
  requestPageTest.test.ts
  Unit tests for web/requestPageTest/index.ts.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDBDir} from '../../test/dbFixture.ts';
import {readFixtureRequests, resetRequestState} from '../../test/requestState.ts';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const reason = 'A reason that is long enough.';

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

beforeEach(() => {
  resetRequestState();
});

after(() => {
  resetRequestState();
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('answer records a request and returns a populated answer page with escaped values', async () => {
  const result: any = await answer('s-fixtur', ' About  <Us> ', 'https://example.com/about', reason);
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Fixture Site About &lt;Us&gt;'));
  assert.ok(result.answerPage.includes('href="/listPages.html/s-fixtur"'));
  assert.deepEqual(readFixtureRequests()['https://example.com/about']?.[0]?.target, {
    siteID: 's-fixtur', pageName: 'About <Us>', url: 'https://example.com/about'
  });
});

test('answer returns an error for a page name of invalid length', async () => {
  const result: any = await answer('s-fixtur', 'x'.repeat(121), 'https://example.com/about', reason);
  assert.deepEqual(result, {status: 'error', message: 'The page name must be between 1 and 120 characters long'});
});

test('answer returns an error explaining a refusal', async () => {
  const noSite: any = await answer('s-zzzzzz', 'About', 'https://example.com/about', reason);
  assert.equal(noSite.message, 'Your request will not be processed, because the specified site does not exist.');
  const pageExists: any = await answer('s-fixtur', 'Mixed Outcomes', 'https://example.com/about', reason);
  assert.ok(pageExists.message.includes('“Mixed Outcomes” (identifier p-mixedout)'));
});
