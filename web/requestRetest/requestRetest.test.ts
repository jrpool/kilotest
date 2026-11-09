/*
  requestRetest.test.ts
  Unit tests for web/requestRetest/index.ts.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDBDir} from '../../test/dbFixture.ts';
import {resetRequestState, writeFixtureJob} from '../../test/requestState.ts';
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

test('answer returns ok with a populated answer page for a valid retest request', async () => {
  const result: any = await answer('260202T0000-new', reason);
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Fixture Site Mixed Outcomes'));
  assert.ok(result.answerPage.includes('https://example.com/mixed'));
});

test('answer returns an error when the report does not exist', async () => {
  assert.deepEqual(await answer('990101T0000-zzz', reason), {status: 'error', message: 'Invalid request'});
});

test('answer returns an error explaining a refusal', async () => {
  const superseded: any = await answer('260101T0000-mix', reason);
  assert.ok(superseded.message.includes('a later report about the page is available.'));
  writeFixtureJob('claimed', 'claimed', {sources: {pageID: 'p-branchco'}, target: {url: 'https://example.com/branch'}});
  const claimed: any = await answer('260101T0009-brd', reason);
  assert.ok(claimed.message.includes('a test of the page is already approved'));
});
