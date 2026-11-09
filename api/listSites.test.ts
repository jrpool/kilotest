/*
  listSites.test.ts
  Tests for api/listSites.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixtureDBDir} from '../test/dbFixture.ts';
import {resetRequestState} from '../test/requestState.ts';
import {response} from './listSites.ts';
import {listSitesResponseSchema} from './schemas.ts';

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

test('listSites lists only tested sites, with their counts of tested pages', async () => {
  addUntestedSite();
  const body = await response();
  assert.deepEqual(body['response content']['basics about all tested sites'], [
    {identifier: 's-fixtur', name: 'Fixture Site', 'count of tested pages': 7}
  ]);
  assert.deepEqual(listSitesResponseSchema.parse(body), body);
});

test('listSites orders sites by name and describes how to drill down and request tests', async () => {
  const registryPath = path.join(fixtureDBDir, 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.sites['s-aaaaaa'] = 'A Site';
  registry.pages['p-mixedout'].sites = ['s-aaaaaa'];
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  const body = await response();
  const content = body['response content'];
  assert.deepEqual(content['basics about all tested sites'].map(site => site.name), ['A Site', 'Fixture Site']);
  assert.equal(content['how to list the tested pages of a site'].URL, 'https://kilotest.example.com/api/listPages/{identifier}');
  assert.equal(content['how to request a test of a page of a site not in this list'].URL, 'https://kilotest.example.com/api/requestNewTest');
  assert.equal(body['tool name'], 'listSites');
  assert.equal(body['this request']['closest ancestor request'], null);
});
