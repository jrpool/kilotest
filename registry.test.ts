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
  changeRegistry,
  getHost,
  getNameKey,
  getNewID,
  getRegistry,
  getSitePages,
  isPageError,
  isPageID,
  isSiteID,
  planPage,
  registerPage,
  registryPath
} from './registry.ts';
import type {PageError, RegisteredPage} from './registry.ts';

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
test('getNameKey ignores case, apostrophes, white space, and punctuation, but not parenthesized parts', () => {
  assert.equal(getNameKey('Women’s  Liberation Front'), getNameKey('womens liberation front.'));
  assert.notEqual(getNameKey('Springfield (Oregon)'), getNameKey('Springfield (Illinois)'));
});
test('getHost returns the lowercase host of a URL, or an empty string for an invalid URL', () => {
  assert.equal(getHost('https://WWW.Example.org/a'), 'www.example.org');
  assert.equal(getHost('not a URL'), '');
});
test('planPage resolves targets and reports why a target cannot be resolved', () => {
  const registry = {
    sites: {'s-aaaaaa': 'Example Org'},
    pages: {'p-aaaaaaaa': {sites: ['s-aaaaaa'], name: 'Home', url: 'https://example.org/'}}
  };
  assert.deepEqual(planPage(registry, {pageID: 'p-aaaaaaaa'}), {
    siteID: 's-aaaaaa', siteName: 'Example Org', pageID: 'p-aaaaaaaa', pageName: 'Home', url: 'https://example.org/'
  });
  assert.deepEqual(planPage(registry, {pageID: 'p-zzzzzzzz'}), {result: 'noPage'});
  assert.deepEqual(
    planPage(registry, {siteID: 's-aaaaaa', pageName: 'contact', url: 'https://example.org/contact'}),
    {siteID: 's-aaaaaa', siteName: 'Example Org', pageID: null, pageName: 'contact', url: 'https://example.org/contact'}
  );
  assert.deepEqual(
    planPage(registry, {siteID: 's-zzzzzz', pageName: 'contact', url: 'https://example.org/contact'}), {result: 'noSite'}
  );
  // Page names match after normalization.
  assert.deepEqual(
    planPage(registry, {siteID: 's-aaaaaa', pageName: ' home ', url: 'https://example.org/x'}),
    {result: 'pageExists', pageID: 'p-aaaaaaaa'}
  );
  assert.deepEqual(
    planPage(registry, {siteName: 'example org.', pageName: 'home', url: 'https://example.org/'}),
    {result: 'siteExists', siteID: 's-aaaaaa'}
  );
  assert.deepEqual(
    planPage(registry, {siteName: 'Example Org (EO)', pageName: 'home', url: 'https://eo.org/'}),
    {siteID: null, siteName: 'Example Org (EO)', pageID: null, pageName: 'home', url: 'https://eo.org/'}
  );
});
test('registerPage creates sites and pages, returns existing pages, and refuses unresolvable targets', async () => {
  await withDB(async () => {
    const first = await registerPage({siteName: 'Example', pageName: 'home', url: 'https://example.org/'});
    assert.equal(isPageError(first), false);
    const {siteID, pageID} = first as RegisteredPage;
    assert.equal(isSiteID(siteID) && isPageID(pageID), true);
    const second = await registerPage({siteID, pageName: 'contact', url: 'https://example.org/contact'});
    assert.equal((second as RegisteredPage).siteID, siteID);
    // An existing page is returned without a change.
    assert.deepEqual(await registerPage({pageID}), first);
    assert.deepEqual(await registerPage({siteName: 'EXAMPLE', pageName: 'x', url: 'https://x.org/'}), {
      result: 'siteExists', siteID
    } satisfies PageError);
    const registry = await getRegistry();
    assert.deepEqual(registry.sites, {[siteID]: 'Example'});
    assert.deepEqual(registry.pages[pageID], {sites: [siteID], name: 'home', url: 'https://example.org/'});
    assert.deepEqual(getSitePages(registry, siteID).map(([, page]) => page.name), ['contact', 'home']);
    assert.deepEqual(getSitePages(registry, 's-zzzzzz'), []);
  });
});
test('changeRegistry serializes concurrent changes', async () => {
  await withDB(async () => {
    const first = await registerPage({siteName: 'Example', pageName: 'home', url: 'https://example.org/'});
    const {siteID} = first as RegisteredPage;
    await Promise.all(['a', 'b', 'c', 'd'].map(
      pageName => registerPage({siteID, pageName, url: `https://example.org/${pageName}`})
    ));
    const registry = await getRegistry();
    assert.equal(Object.keys(registry.sites).length, 1);
    assert.equal(Object.keys(registry.pages).length, 5);
  });
});
