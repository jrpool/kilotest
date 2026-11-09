/*
  requestPageTest.test.ts
  Tests for api/requestPageTest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDBDir} from '../test/dbFixture.ts';
import {readFixtureRequests, resetRequestState, writeFixtureJob} from '../test/requestState.ts';

// Blank the alert configuration unconditionally, before the module under test (whose submissions call sendAlert) is ever imported below, so this file sends no real alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
// Allow internal targets, so tests do not depend on real DNS/network access.
process.env.ALLOW_INTERNAL_TARGETS = 'true';

import {response} from './requestPageTest.ts';
import {requestPageTestResponseSchema} from './schemas.ts';

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
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// FUNCTIONS

// Returns the details and disposition of a response.
const getContent = (body: Awaited<ReturnType<typeof response>>) => ({
  details: body['response content']['details about your request'] as any,
  disposition: body['response content']['disposition of your request'] as any
});

// TESTS

test('requestPageTest rejects a malformed site identifier and invalid page names', async () => {
  const cases: [string[], string][] = [
    [['fixtur', 'About', 'https://example.com/about', reason], 'siteID is malformed'],
    [['s-fixtur', '', 'https://example.com/about', reason], 'page name'],
    [['s-fixtur', 'x'.repeat(121), 'https://example.com/about', reason], 'page name']
  ];
  for (const [args, fragment] of cases) {
    const {details, disposition} = getContent(await response(args));
    assert.ok(details.error.includes(fragment), details.error);
    assert.equal(disposition, null);
  }
});

test('requestPageTest refuses a nonexistent site and an existing page name', async () => {
  const noSite = getContent(await response(['s-zzzzzz', 'About', 'https://example.com/about', reason]));
  assert.equal(noSite.details['page to be tested']['site identifier'], 's-zzzzzz');
  assert.ok(noSite.disposition['what happens next'].includes('the specified site does not exist.'));
  const pageExists = getContent(await response(['s-fixtur', 'MIXED  outcomes', 'https://example.com/about', reason]));
  assert.equal(pageExists.details['page to be tested']['page name'], 'MIXED outcomes');
  assert.ok(pageExists.disposition['what happens next'].includes('“Mixed Outcomes” (identifier p-mixedout)'));
});

test('requestPageTest records a valid request for management review', async () => {
  const body = await response(['s-fixtur', 'About', 'https://example.com/about', reason]);
  const {details, disposition} = getContent(body);
  assert.deepEqual(details['page to be tested'], {
    'site identifier': 's-fixtur',
    'site name': 'Fixture Site',
    'page identifier': null,
    'page name': 'About',
    URL: 'https://example.com/about'
  });
  assert.ok(disposition['how you can check for completion'].includes('siteID "s-fixtur"'));
  assert.deepEqual(readFixtureRequests()['https://example.com/about']?.[0]?.target, {
    siteID: 's-fixtur', pageName: 'About', url: 'https://example.com/about'
  });
  assert.deepEqual(requestPageTestResponseSchema.parse(body), body);
});

test('requestPageTest orders a test under immediate review and refers a possible duplicate', async () => {
  const ordered = await response(['s-fixtur', 'About', 'https://example.com/about', reason, 'true']);
  assert.match(getContent(ordered).disposition['report identifier'], /^\d{6}T\d{4}-[0-9a-z]{3}$/);
  assert.deepEqual(requestPageTestResponseSchema.parse(ordered), ordered);
  const referred = getContent(await response(['s-fixtur', 'Branch Again', 'https://example.com/branch', reason, 'true']));
  assert.equal(referred.disposition['whether your request was referred to management review'], true);
  assert.equal(referred.disposition['possible duplicates'][0].identifier, 'p-branchco');
  // A request for a page with a queued job is refused.
  writeFixtureJob('queue', 'queued', {target: {url: 'https://example.com/queued'}});
  const queued = getContent(await response(['s-fixtur', 'Queued', 'https://example.com/queued', reason, 'true']));
  assert.ok(queued.disposition['what happens next'].includes('equivalent URL is already approved'));
});

test('requestPageTest describes its request and ancestor', async () => {
  const body = await response(['s-fixtur', 'About', 'https://example.com/about', reason]);
  assert.equal(body['tool name'], 'requestPageTest');
  assert.equal(body['this request'].URL, 'https://kilotest.example.com/api/requestPageTest/s-fixtur');
  assert.deepEqual(body['this request'].body, {
    pageName: 'About', URL: 'https://example.com/about', reason, reviewImmediately: false
  });
  assert.equal(body['this request']['closest ancestor request'].URL, 'https://kilotest.example.com/api/listPages/s-fixtur');
  assert.equal(
    body['URLs of similar requests for web users']['this request'], 'https://kilotest.example.com/requestPageTestForm.html/s-fixtur'
  );
});
