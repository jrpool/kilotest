/*
  listPages.test.ts
  Tests for api/listPages.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {response} from './listPages.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../test/dbFixture.ts')).fixtureDBDir;
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

test('listPages returns one entry per tested page, sorted by page description', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const descriptions = pagesBasics.map(b => b['tested web page'].description);
  assert.deepEqual(
    descriptions,
    [
      'All CantTell Page',
      'Branch Coverage Page',
      'Empty Results Page',
      'Mixed Outcomes',
      'Multi Violator Page',
      'No Outcomes Page',
      'Prevented Page'
    ]
  );
});

test('listPages does not include the page of the hidden report', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const ids = pagesBasics.map(b => b['basics about the latest report'].identifier);
  assert.ok(!ids.includes('260101T0007-hid'), 'hidden report must not appear in listPages');
});

test('listPages describes a multi-report page by its latest report and its report count', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const mixed = pagesBasics.find(b => b['tested web page'].description === 'Mixed Outcomes')!;
  assert.equal(mixed['number of reports about the page'], 2);
  const latest = mixed['basics about the latest report'];
  assert.equal(latest.identifier, '260202T0000-new');
  assert.equal(latest['completion date and time'], '2026-02-02T00:10:00.000Z');
  assert.equal(typeof latest['days since the report was completed'], 'number');
  assert.equal(mixed['how to get details about the latest report'].method, 'GET');
  assert.ok(mixed['how to get details about the latest report'].URL.endsWith('/api/listIssues/260202T0000/new'));
  assert.ok(mixed['web users can get details about the latest report at'].endsWith('/listIssues.html/260202T0000/new'));
});

test('listPages describes a single-report page', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const canttell = pagesBasics.find(b => b['tested web page'].description === 'All CantTell Page')!;
  assert.equal(canttell['number of reports about the page'], 1);
  assert.equal(canttell['tested web page'].URL, 'https://example.com/canttell');
  assert.equal(canttell['basics about the latest report'].identifier, '260101T0001-ct');
});

test('listPages includes request-test instructions', async () => {
  const body = await response();
  const content = body['response content'];
  assert.ok(content['how to request that a page with no report be tested']);
  assert.ok(content['how a web user can request that the page be tested']);
  assert.equal(content['how to request that a page with no report be tested'].method, 'POST');
});

test('listPages includes tool name and metadata', async () => {
  const body = await response();
  assert.equal(body['tool name'], 'listPages');
  assert.ok(body['response metadata'].identifier);
  assert.ok(body['response metadata']['date and time']);
});
