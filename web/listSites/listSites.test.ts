/*
  listSites.test.ts
  UI tests for web/listSites/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  // Ensure job subdirectories exist (they are empty and not tracked by Git).
  for (const sub of ['queue', 'claimed', 'failed']) {
    await fs.mkdir(path.join(process.env.DB_DIR, 'jobs', sub), {recursive: true});
  }
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

test('listSites returns an ok status with valid HTML', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Sites tested | Kilotest');
});

// Returns the links in the list of tested sites.
const getSiteLinks = (answerPage: string) => parse(answerPage).querySelectorAll('main > ul > li > a');

test('listSites lists the tested sites with their counts of tested pages', async () => {
  const result: any = await answer();
  const links = getSiteLinks(result.answerPage);
  assert.deepEqual(links.map(a => [a.text, a.getAttribute('href')]), [['Fixture Site (7 tested pages)', '/listPages.html/s-fixtur']]);
  assert.ok(result.answerPage.includes('Fixture Site (7 tested pages)</a>'));
  assert.ok(result.answerPage.includes('<p>Get test results for:</p>'));
});

test('listSites counts a single tested page in the singular and omits sites with no tested pages', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const registryPath = path.join(dbDir, 'registry.json');
  const original = await fs.readFile(registryPath, 'utf8');
  try {
    const registry = JSON.parse(original);
    registry.sites['s-singles'] = 'Single Site';
    registry.pages['p-mixedout'].sites = ['s-singles'];
    registry.sites['s-untest'] = 'Untested Site';
    await fs.writeFile(registryPath, JSON.stringify(registry));
    const result: any = await answer();
    assert.ok(result.answerPage.includes('Single Site (1 tested page)</a>'));
    assert.ok(result.answerPage.includes('Fixture Site (6 tested pages)</a>'));
    assert.ok(!result.answerPage.includes('Untested Site'));
  }
  finally {
    await fs.writeFile(registryPath, original);
  }
});

test('listSites includes a link to request testing a page of a new site', async () => {
  const result: any = await answer();
  assert.ok(parse(result.answerPage).querySelector('a[href="/requestNewTestForm.html"]'));
});

test('listSites shows requested new sites, but not requests or jobs concerning tested sites', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const {resetRequestState, writeFixtureJob} = await import('../../test/requestState.ts');
  const request = (target: unknown) => ({
    id: 'q-aaaaaa', timeStamp: '260101T0000', target, reason: 'A reason', referred: false, possibleDuplicates: [], similarSites: []
  });
  try {
    await fs.writeFile(path.join(dbDir, 'jobs', 'testRequests.json'), JSON.stringify({
      'https://new.example/': [request({siteName: 'New <Org>', pageName: 'home', url: 'https://new.example/'})],
      'https://example.com/mixed': [request({pageID: 'p-mixedout'})]
    }));
    const registryPath = path.join(dbDir, 'registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    registry.sites['s-queued'] = 'Queued Org';
    registry.pages['p-queuedpg'] = {sites: ['s-queued'], name: 'home', url: 'https://queued.example/'};
    registry.sites['s-claimed'] = 'Claimed Org';
    registry.pages['p-claimedp'] = {sites: ['s-claimed'], name: 'home', url: 'https://claimed.example/'};
    // A page whose report is available but which is missing from the registry contributes no site.
    delete registry.pages['p-nooutcom'];
    await fs.writeFile(registryPath, JSON.stringify(registry));
    writeFixtureJob('queue', 'queued', {sources: {pageID: 'p-queuedpg'}, target: {url: 'https://queued.example/'}});
    writeFixtureJob('claimed', 'claimed', {sources: {pageID: 'p-claimedp'}, target: {url: 'https://claimed.example/'}});
    // Jobs for a tested site and from before sites existed are not shown.
    writeFixtureJob('queue', 'retest', {sources: {pageID: 'p-mixedout'}, target: {url: 'https://example.com/mixed'}});
    writeFixtureJob('queue', 'old', {target: {url: 'https://old.example/'}});
    const result: any = await answer();
    const items = parse(result.answerPage).querySelectorAll('main > h2 + ul')[0]?.querySelectorAll('li').map(li => li.text);
    assert.deepEqual(items, [
      'Claimed Org (being tested)',
      'New <Org> (awaiting approval)',
      'Queued Org (queued for testing)'
    ]);
    assert.ok(result.answerPage.includes('New &lt;Org&gt;'));
    assert.ok(result.answerPage.includes('href="/enqueueForm.html"'));
    assert.ok(!result.answerPage.includes('Mixed Outcomes'));
  }
  finally {
    resetRequestState();
  }
});

test('listSites omits the manager link when no new site awaits approval, and the section when none is requested', async () => {
  const dbDir = (await import('../../test/dbFixture.ts')).fixtureDBDir;
  const {resetRequestState, writeFixtureJob} = await import('../../test/requestState.ts');
  try {
    let result: any = await answer();
    assert.ok(!result.answerPage.includes('Requested new sites'));
    const registryPath = path.join(dbDir, 'registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    registry.sites['s-queued'] = 'Queued Org';
    registry.pages['p-queuedpg'] = {sites: ['s-queued'], name: 'home', url: 'https://queued.example/'};
    await fs.writeFile(registryPath, JSON.stringify(registry));
    writeFixtureJob('queue', 'queued', {sources: {pageID: 'p-queuedpg'}, target: {url: 'https://queued.example/'}});
    result = await answer();
    assert.ok(result.answerPage.includes('Queued Org (queued for testing)'));
    assert.ok(!result.answerPage.includes('href="/enqueueForm.html"'));
  }
  finally {
    resetRequestState();
  }
});

test('listSites shows no-reports message when the database is empty', async () => {
  // Create a temp DB with empty reports and jobs directories.
  const os = await import('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listpages-empty-'));
  await fs.mkdir(path.join(tmpDir, 'reports'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'queue'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'claimed'), {recursive: true});
  await fs.mkdir(path.join(tmpDir, 'jobs', 'failed'), {recursive: true});
  await fs.writeFile(path.join(tmpDir, 'jobs', 'testRequests.json'), '{}\n');
  const savedDBDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {answer} = await import('./index.ts');
    const result: any = await answer();
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('<p>No sites have been tested yet.</p>'));
    assert.equal(getSiteLinks(result.answerPage).length, 0);
  }
  finally {
    process.env.DB_DIR = savedDBDir;
    await fs.rm(tmpDir, {recursive: true}).catch(() => {});
  }
});
