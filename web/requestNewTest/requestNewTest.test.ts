/*
  requestNewTest.test.ts
  Unit tests for web/requestNewTest/index.ts.
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

test('answer returns ok with a populated answer page for a valid request', async () => {
  const result: any = await answer('', '  New   Web Org ', 'home', 'https://example.com/web-new', reason);
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('New Web Org home'));
  assert.ok(result.answerPage.includes('https://example.com/web-new'));
  assert.ok(result.answerPage.includes(reason));
});

test('answer returns an error for a site or page name of invalid length', async () => {
  const longSite: any = await answer('', 'x'.repeat(81), 'home', 'https://example.com/web-new', reason);
  assert.equal(longSite.message, 'The site name must be between 1 and 80 characters long');
  const emptyPage: any = await answer('', 'Org', ' ', 'https://example.com/web-new', reason);
  assert.equal(emptyPage.message, 'The page name must be between 1 and 120 characters long');
});

test('answer returns an error explaining a refusal', async () => {
  const existing: any = await answer('', 'Fixture Site', 'home', 'https://example.com/web-new', reason);
  assert.equal(existing.status, 'error');
  assert.ok(existing.message.startsWith('Your request will not be processed, because a site named “Fixture Site”'));
  writeFixtureJob('queue', 'queued', {target: {url: 'https://example.com/web-queued'}});
  const queued: any = await answer('', 'Org', 'home', 'https://example.com/web-queued', reason);
  assert.ok(queued.message.includes('equivalent URL is already approved'));
  const short: any = await answer('', 'Org', 'home', 'https://x.c', reason);
  assert.ok(short.message.includes('not between 12 and 300 characters long'));
  await answer('', 'Dup Org', 'home', 'https://example.com/web-dup', reason);
  const duplicate: any = await answer('', 'Dup Org', 'home', 'https://example.com/web-dup', reason);
  assert.ok(duplicate.message.includes('an identical request is already awaiting approval.'));
});

test('answer records a request for a page of an existing site', async () => {
  const result: any = await answer('s-fixtur', '', ' About  <Us> ', 'https://example.com/about', reason);
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Fixture Site About &lt;Us&gt;'));
  assert.ok(result.answerPage.includes('href="/listPages.html/s-fixtur"'));
  const pageExists: any = await answer('s-fixtur', '', 'Mixed Outcomes', 'https://example.com/about2', reason);
  assert.ok(pageExists.message.includes('“Mixed Outcomes” (identifier p-mixedout)'));
  const noSite: any = await answer('s-zzzzzz', '', 'About', 'https://example.com/about3', reason);
  assert.equal(noSite.message, 'Your request will not be processed, because the specified site does not exist.');
});

test('answer links a request for a page of a new site to the list of tested sites', async () => {
  const result: any = await answer('', 'Linked Org', 'home', 'https://example.com/linked', reason);
  assert.ok(result.answerPage.includes('href="/listSites.html"'));
});
