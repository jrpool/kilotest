/*
  registry.test.ts
  Tests for registry.ts.
*/

// IMPORTS

import {mock, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addPage, changeRegistry, getNewID, getRegistry, getSitePages, isPageID, isSiteID, registryPath
} from './registry.ts';

// FUNCTIONS

// Runs an asynchronous function with DB_DIR pointing to a new temporary data directory, and then removes the directory.
const withDB = async (run: (dbDir: string) => Promise<void>): Promise<void> => {
  const savedDBDir = process.env.DB_DIR;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-registry-'));
  try {
    process.env.DB_DIR = dbDir;
    await run(dbDir);
  }
  finally {
    if (savedDBDir === undefined) {
      delete process.env.DB_DIR;
    }
    else {
      process.env.DB_DIR = savedDBDir;
    }
    fs.rmSync(dbDir, {recursive: true, force: true});
  }
};

// TESTS

test('isSiteID and isPageID accept only identifiers of their own type', () => {
  assert.equal(isSiteID('s-2fw2ea'), true);
  assert.equal(isSiteID('p-l6vni7ua'), false);
  assert.equal(isSiteID('s-2FW2EA'), false);
  assert.equal(isSiteID(7), false);
  assert.equal(isPageID('p-l6vni7ua'), true);
  assert.equal(isPageID('p-l6vni7u'), false);
  assert.equal(isPageID('s-2fw2ea'), false);
});
test('getNewID regenerates an identifier that is already used', () => {
  // Make the first identifier all zeros and the second all ones.
  let callCount = 0;
  const random = mock.method(Math, 'random', () => callCount++ < 6 ? 0 : 1 / 36);
  try {
    const usedIDs = new Set(['s-000000']);
    assert.equal(getNewID('site', usedIDs), 's-111111');
    assert.equal(usedIDs.has('s-111111'), true);
  }
  finally {
    random.mock.restore();
  }
  assert.match(getNewID('page', new Set()), /^p-[0-9a-z]{8}$/);
});
test('getRegistry returns an empty registry if none exists and throws if one is defective', async () => {
  await withDB(async () => {
    assert.deepEqual(await getRegistry(), {sites: {}, pages: {}});
    fs.writeFileSync(registryPath(), '{');
    await assert.rejects(getRegistry(), /Registry not JSON/);
    fs.rmSync(registryPath());
    fs.mkdirSync(registryPath());
    await assert.rejects(getRegistry(), /Registry unreadable/);
  });
});
test('changeRegistry writes only when the change says so', async () => {
  await withDB(async dbDir => {
    const result = await changeRegistry(registry => {
      registry.sites['s-aaaaaa'] = 'A';
      return {write: false, result: 'unchanged'};
    });
    assert.equal(result, 'unchanged');
    assert.equal(fs.existsSync(registryPath()), false);
    await changeRegistry(registry => {
      registry.sites['s-aaaaaa'] = 'A';
      return {write: true, result: null};
    });
    assert.deepEqual(await getRegistry(), {sites: {'s-aaaaaa': 'A'}, pages: {}});
    // No temporary file remains.
    assert.deepEqual(fs.readdirSync(dbDir), ['registry.json']);
  });
});
test('addPage creates or reuses sites and refuses missing sites and duplicate pages', async () => {
  await withDB(async () => {
    const first = await addPage({siteName: 'Example', pageName: 'home', url: 'https://example.org/'});
    assert.ok(!('error' in first));
    assert.equal(isSiteID(first.siteID) && isPageID(first.pageID), true);
    // A named site that exists is reused.
    const second = await addPage({siteName: 'Example', pageName: 'contact', url: 'https://example.org/contact'});
    assert.ok(!('error' in second));
    assert.equal(second.siteID, first.siteID);
    // An identified site is used.
    const third = await addPage({siteID: first.siteID, pageName: 'about', url: 'https://example.org/about'});
    assert.ok(!('error' in third));
    assert.equal(third.siteID, first.siteID);
    assert.deepEqual(await addPage({siteID: 's-zzzzzz', pageName: 'home', url: 'https://x.org/'}), {error: 'noSite'});
    assert.deepEqual(
      await addPage({siteName: 'Example', pageName: 'home', url: 'https://example.org/'}), {error: 'pageExists'}
    );
    const registry = await getRegistry();
    assert.deepEqual(registry.sites, {[first.siteID]: 'Example'});
    assert.deepEqual(registry.pages[first.pageID], {sites: [first.siteID], name: 'home', url: 'https://example.org/'});
    assert.deepEqual(getSitePages(registry, first.siteID).map(([, page]) => page.name), ['about', 'contact', 'home']);
    assert.deepEqual(getSitePages(registry, 's-zzzzzz'), []);
  });
});
test('changeRegistry serializes concurrent changes', async () => {
  await withDB(async () => {
    const results = await Promise.all(['a', 'b', 'c', 'd'].map(
      pageName => addPage({siteName: 'Example', pageName, url: `https://example.org/${pageName}`})
    ));
    const registry = await getRegistry();
    assert.equal(Object.keys(registry.sites).length, 1);
    assert.equal(Object.keys(registry.pages).length, 4);
    assert.equal(new Set(results.map(result => 'siteID' in result && result.siteID)).size, 1);
  });
});
