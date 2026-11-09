/*
  listPages.test.ts
  Tests for api/listPages.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';
import {resetRequestState} from '../test/requestState.ts';
import {response} from './listPages.ts';
import {listPagesResponseSchema} from './schemas.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

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

// Adds a site with no tested page to the registry.
const addUntestedSite = (): void => {
  const registryPath = path.join(fixtureDBDir, 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.sites['s-untest'] = 'Untested Site';
  registry.pages['p-untested'] = {sites: ['s-untest'], name: 'home', url: 'https://untested.example/'};
  fs.writeFileSync(registryPath, JSON.stringify(registry));
};

// TESTS

test('listPages lists the tested pages of a site by name, each with its latest report', async () => {
  const body = await response(['s-fixtur']);
  const content = body['response content'];
  assert.deepEqual(content['basics about the site'], {identifier: 's-fixtur', name: 'Fixture Site'});
  const pages = content['basics about all tested pages of the site'] ?? [];
  assert.deepEqual(pages.map(page => page.name), [
    'All CantTell Page',
    'Branch Coverage Page',
    'Empty Results Page',
    'Mixed Outcomes',
    'Multi Violator Page',
    'No Outcomes Page',
    'Prevented Page'
  ]);
  assert.deepEqual(pages.find(page => page.identifier === 'p-mixedout'), {
    identifier: 'p-mixedout',
    name: 'Mixed Outcomes',
    URL: 'https://example.com/mixed',
    sites: [{identifier: 's-fixtur', name: 'Fixture Site'}],
    'identifier of the latest report': '260202T0000-new'
  });
  assert.equal(content['how to request a test of a page of this site not in this list']?.URL, 'https://kilotest.example.com/api/requestPageTest/s-fixtur');
  assert.equal(content['how a web user can request a test of a page of this site not in this list']?.URL, 'https://kilotest.example.com/requestPageTestForm.html/s-fixtur');
  assert.equal(body['this request']['closest ancestor request']['tool name'], 'listSites');
  assert.deepEqual(listPagesResponseSchema.parse(body), body);
});

test('listPages returns an empty list for a registered site with no tested pages', async () => {
  addUntestedSite();
  const body = await response(['s-untest']);
  assert.deepEqual(body['response content']['basics about all tested pages of the site'], []);
});

test('listPages reports a nonexistent or malformed site identifier', async () => {
  for (const siteID of ['s-zzzzzz', 'nonsense']) {
    const body = await response([siteID]);
    const content = body['response content'];
    assert.deepEqual(content['basics about the site'], {error: `Site ${siteID} does not exist.`});
    assert.equal(content['basics about all tested pages of the site'], null);
    assert.equal(content['how to request a test of a page of this site not in this list'], null);
    assert.deepEqual(listPagesResponseSchema.parse(body), body);
  }
  assert.equal((await response([]))['this request'].URL, 'https://kilotest.example.com/api/listPages/');
});
