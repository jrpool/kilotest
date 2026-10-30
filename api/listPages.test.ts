/*
  listPages.test.ts
  Tests for api/listPages.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {response} from './listPages.ts';
import {listPagesResponseSchema} from './schemas.ts';

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
  const descriptions = pagesBasics.map(b => b.description);
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
  const ids = pagesBasics.map(b => b.identifier);
  assert.ok(!ids.includes('260101T0007-hid'), 'hidden report must not appear in listPages');
});

test('listPages identifies a multi-report page by its latest report', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const mixed = pagesBasics.find(b => b.description === 'Mixed Outcomes')!;
  assert.equal(mixed.identifier, '260202T0000-new');
  assert.equal(mixed.URL, 'https://example.com/mixed');
});

test('listPages describes a single-report page', async () => {
  const body = await response();
  const pagesBasics = body['response content']['basics about all tested pages'];
  const canttell = pagesBasics.find(b => b.description === 'All CantTell Page')!;
  assert.equal(canttell.URL, 'https://example.com/canttell');
  assert.equal(canttell.identifier, '260101T0001-ct');
});

test('listPages includes result-retrieval instructions with an identifier placeholder', async () => {
  const body = await response();
  const content = body['response content'];
  assert.equal(content['how to get test results about a page'].method, 'GET');
  assert.ok(content['how to get test results about a page'].URL.endsWith('/api/listIssues/{identifier}'));
  assert.ok(content['web users can get test results about a page at'].endsWith('/listIssues.html/{identifier}'));
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

test('listPages response conforms to its response schema', async () => {
  // parse() catches missing or mistyped keys; comparing the parsed result to the
  // original catches extra keys that zod strips but that the strict JSON schema
  // advertised to MCP clients (additionalProperties: false) rejects.
  const body = await response();
  assert.deepEqual(listPagesResponseSchema.parse(body), body);
});
