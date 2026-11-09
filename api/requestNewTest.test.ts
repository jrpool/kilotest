/*
  requestNewTest.test.ts
  Tests for api/requestNewTest.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDBDir} from '../test/dbFixture.ts';
import {readFixtureRequests, resetRequestState, writeFixtureJob} from '../test/requestState.ts';

// Blank the alert configuration unconditionally, before ./requestNewTest.ts (whose submissions call sendAlert) is ever imported below, so this file sends no real alert emails even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}
// Allow internal targets by default, so tests that submit an ordinary https://example.com/... URL do not depend on real DNS/network access. The tests of the check itself override this.
process.env.ALLOW_INTERNAL_TARGETS = 'true';

import {response} from './requestNewTest.ts';
import {requestNewTestResponseSchema} from './schemas.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
const reason = 'A reason that is long enough.';
let logged: string[] = [];
const originalLog = console.log;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
});

// Reset the request state and capture console.log, so the alerts that submissions emit can be observed and tests are order-independent.
beforeEach(() => {
  resetRequestState();
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
});

after(() => {
  console.log = originalLog;
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
// Returns whether an alert about a pending request was logged.
const alerted = () => logged.some(line => line.includes('request for a new test awaits approval'));

// TESTS

test('requestNewTest rejects names, reasons, and URLs of invalid length or form', async () => {
  const cases: [string[], string][] = [
    [['', 'home', 'https://example.org/', reason], 'site name'],
    [['x'.repeat(81), 'home', 'https://example.org/', reason], 'site name'],
    [['Org', '  ', 'https://example.org/', reason], 'page name'],
    [['Org', 'x'.repeat(121), 'https://example.org/', reason], 'page name'],
    [['Org', 'home', 'https://example.org/', 'short'], 'reason'],
    [['Org', 'home', 'https://example.org/', 'x'.repeat(101)], 'reason'],
    [['Org', 'home', 'short', reason], '12 and 300'],
    [['Org', 'home', 'not-a-valid-url', reason], 'invalid URL']
  ];
  for (const [args, fragment] of cases) {
    const {details, disposition} = getContent(await response(args));
    assert.ok(details.error.includes(fragment), `${args.join('|')}: ${details.error}`);
    assert.equal(disposition, null);
  }
  assert.ok(!alerted());
});

test('requestNewTest rejects a private-address URL unless internal targets are allowed', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  try {
    const {details} = getContent(await response(['Internal', 'home', 'https://192.168.1.1/page', reason]));
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
    assert.ok(!alerted());
  }
  finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('requestNewTest rejects a URL that redirects to a disallowed target, and alerts a manager', async (t) => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  t.mock.method(globalThis, 'fetch', async () => ({url: 'https://10.0.0.5/page'}) as Response);
  try {
    const {details} = getContent(await response(['Redirector', 'home', 'https://example.com/redirector', reason]));
    assert.ok(details.error.includes('does not resolve to a page that this deployment can test'));
    assert.ok(logged.some(line =>
      line.includes('WARNING (Kilotest: request rejected for redirecting to a disallowed target)')
      && line.includes('https://example.com/redirector')
    ));
  }
  finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('requestNewTest compares the URL to which the requested URL redirects with the URLs of tested pages', async (t) => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  t.mock.method(globalThis, 'fetch', async () => ({url: 'https://example.com/mixed'}) as Response);
  try {
    const {disposition} = getContent(await response(['Redirector', 'home', 'https://example.com/redirector', reason]));
    assert.equal(disposition['possible duplicates'][0].identifier, 'p-mixedout');
    assert.equal(disposition['possible duplicates'][0]['identifier of the latest report'], '260202T0000-new');
  }
  finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('requestNewTest refuses a site name matching that of an existing site', async () => {
  const {details, disposition} = getContent(await response(['  fixture   SITE. ', 'home', 'https://fixture.example/', reason]));
  assert.equal(details['page to be tested']['site name'], 'fixture SITE.');
  assert.ok(disposition['what happens next'].includes('a site named “Fixture Site” (identifier s-fixtur) already exists'));
  assert.ok(!alerted());
});

test('requestNewTest refuses a page whose URL is that of a queued job', async () => {
  writeFixtureJob('queue', 'queued', {target: {url: 'https://example.com/queued-url'}});
  const {disposition} = getContent(await response(['Queued Org', 'home', 'https://example.com/queued-url', reason]));
  assert.ok(disposition['what happens next'].includes('a page with an equivalent URL is already approved'));
});

test('requestNewTest refuses a duplicate request', async () => {
  await response(['Dup Org', 'home', 'https://example.com/dup-api', reason]);
  const {disposition} = getContent(await response(['Dup Org', 'home', 'https://example.com/dup-api', reason]));
  assert.ok(disposition['what happens next'].includes('an identical request is already awaiting approval.'));
});

test('requestNewTest records a valid request for management review and alerts a manager', async () => {
  const body = await response(['Brand New Org', 'home', 'https://example.com/brandnew', reason]);
  const {details, disposition} = getContent(body);
  assert.deepEqual(details['page to be tested'], {
    'site identifier': null,
    'site name': 'Brand New Org',
    'page identifier': null,
    'page name': 'home',
    URL: 'https://example.com/brandnew'
  });
  assert.equal(disposition['whether your request was referred to management review'], false);
  assert.ok(disposition['how you can check for completion'].includes('listSites'));
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: request for a new test awaits approval)')
    && line.includes('Brand New Org')
    && line.includes('Requests now awaiting approval: 1 of 20')
  ));
  assert.deepEqual(requestNewTestResponseSchema.parse(body), body);
});

test('requestNewTest refers a request for immediate review with a possible duplicate to management review', async () => {
  const body = await response(['Mixed Org', 'home', 'https://www.example.com/mixed/', reason, 'true']);
  const {disposition} = getContent(body);
  assert.ok(disposition['what happens next'].startsWith('Your request was referred to management review'));
  assert.equal(disposition['whether your request was referred to management review'], true);
  assert.deepEqual(disposition['possible duplicates'], [{
    identifier: 'p-mixedout',
    name: 'Mixed Outcomes',
    URL: 'https://example.com/mixed',
    sites: [{identifier: 's-fixtur', name: 'Fixture Site'}],
    'identifier of the latest report': '260202T0000-new',
    'reason for suspicion': 'Its URL is equivalent to the requested URL.'
  }]);
  assert.deepEqual(disposition['similar sites'], []);
  assert.equal(readFixtureRequests()['https://www.example.com/mixed/']?.[0]?.referred, true);
  assert.deepEqual(requestNewTestResponseSchema.parse(body), body);
});

test('requestNewTest lists similar sites with their counts of tested pages', async () => {
  const {disposition} = getContent(await response(['Fixture Site (FS)', 'home', 'https://fs.example/', reason, 'true']));
  assert.deepEqual(disposition['similar sites'], [{
    identifier: 's-fixtur',
    name: 'Fixture Site',
    'count of tested pages': 7,
    'reason for suspicion': 'Its name differs from the requested site name only in case, punctuation, or a parenthesized part.'
  }]);
});

test('requestNewTest orders a test of a request that passes every check under immediate review', async () => {
  const body = await response(['Instant Org', 'home', 'https://example.com/instant', reason, 'true']);
  const {details, disposition} = getContent(body);
  assert.match(details['page to be tested']['site identifier'], /^s-[0-9a-z]{6}$/);
  assert.match(details['page to be tested']['page identifier'], /^p-[0-9a-z]{8}$/);
  assert.match(disposition['report identifier'], /^\d{6}T\d{4}-[0-9a-z]{3}$/);
  assert.ok(disposition['do you want to wait for completion'].includes('awaitTest'));
  assert.deepEqual(requestNewTestResponseSchema.parse(body), body);
});

test('requestNewTest refuses a request with a fallback channel when the queue is full', async () => {
  process.env.TEST_REQUEST_QUEUE_MAX = '1';
  try {
    await response(['Filler Org', 'home', 'https://example.com/filler', reason]);
    const body = await response(['One Too Many Org', 'home', 'https://www.example.com/mixed', reason]);
    const {disposition} = getContent(body);
    assert.ok(disposition['what happens next'].includes('too many requests are awaiting approval right now.'));
    assert.ok(disposition['what happens next'].includes('info@kilotest.com'));
    // The possible duplicates are listed even though the request was refused.
    assert.equal(disposition['possible duplicates'].length, 1);
    assert.deepEqual(requestNewTestResponseSchema.parse(body), body);
  }
  finally {
    delete process.env.TEST_REQUEST_QUEUE_MAX;
  }
});

test('requestNewTest describes its request and ancestor', async () => {
  const body = await response(['Org', 'home', 'https://example.org/', reason, 'true']);
  assert.equal(body['tool name'], 'requestNewTest');
  assert.deepEqual(body['this request'].body, {
    siteName: 'Org', pageName: 'home', URL: 'https://example.org/', reason, reviewImmediately: true
  });
  assert.equal(body['this request']['closest ancestor request']['tool name'], 'listSites');
  assert.equal(body['URLs of similar requests for web users']['closest ancestor request'], 'https://kilotest.example.com/listSites.html');
});
