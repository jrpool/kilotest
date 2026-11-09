/*
  requestRetest.test.ts
  Tests for api/requestRetest.ts using the fixture corpus.
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

import {response} from './requestRetest.ts';
import {requestRetestResponseSchema} from './schemas.ts';

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

test('requestRetest rejects a malformed report identifier and a reason of invalid length', async () => {
  const cases: [string[], string][] = [
    [['nonsense', reason], 'reportID is malformed'],
    [['260202T0000-new', 'short'], 'the reason must be between 20 and 100'],
    [['260202T0000-new', 'x'.repeat(101)], 'the reason must be between 20 and 100'],
    [['990101T0000-zzz', reason], 'does not exist']
  ];
  for (const [args, fragment] of cases) {
    const {details, disposition} = getContent(await response(args));
    assert.ok(details.error.includes(fragment), details.error);
    assert.equal(disposition, null);
  }
});

test('requestRetest records a valid request for management review using the URL in the registry', async () => {
  const body = await response(['260202T0000-new', reason]);
  const {details, disposition} = getContent(body);
  assert.deepEqual(details['page to be retested'], {
    'site identifier': 's-fixtur',
    'site name': 'Fixture Site',
    'page identifier': 'p-mixedout',
    'page name': 'Mixed Outcomes',
    URL: 'https://example.com/mixed'
  });
  assert.ok(disposition['how you can check for completion'].includes('listIssues'));
  assert.deepEqual(readFixtureRequests()['https://example.com/mixed']?.[0]?.target, {pageID: 'p-mixedout'});
  assert.deepEqual(requestRetestResponseSchema.parse(body), body);
  // An identical request is a duplicate.
  const again = getContent(await response(['260202T0000-new', reason]));
  assert.ok(again.disposition['what happens next'].includes('an identical request is already awaiting approval.'));
});

test('requestRetest refuses a superseded report and a page with a claimed job', async () => {
  const superseded = getContent(await response(['260101T0000-mix', reason, 'true']));
  assert.ok(superseded.disposition['what happens next'].includes('a later report about the page is available.'));
  writeFixtureJob('claimed', 'claimed', {sources: {pageID: 'p-branchco'}, target: {url: 'https://example.com/elsewhere'}});
  const claimed = getContent(await response(['260101T0009-brd', reason]));
  assert.ok(claimed.disposition['what happens next'].includes('a test of the page is already approved'));
});

test('requestRetest orders a retest under immediate review', async () => {
  const body = await response(['260101T0009-brd', reason, 'true']);
  const {disposition} = getContent(body);
  assert.match(disposition['report identifier'], /^\d{6}T\d{4}-[0-9a-z]{3}$/);
  assert.deepEqual(requestRetestResponseSchema.parse(body), body);
  assert.equal(body['this request']['closest ancestor request']['tool name'], 'listIssues');
});
