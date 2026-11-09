/*
  listPages.test.ts
  UI tests for web/listPages/index.ts using the fixture corpus.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {fixtureDBDir} from '../../test/dbFixture.ts';
import {resetRequestState, writeFixtureJob} from '../../test/requestState.ts';
import {answer} from './index.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = fixtureDBDir;
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

// Returns the links in the list of tested pages.
const getPageLinks = (answerPage: string) => parse(answerPage).querySelectorAll('main > ul > li > a');

// TESTS

test('listPages returns an ok status with valid HTML naming the site', async () => {
  const result: any = await answer('s-fixtur');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('title')?.text, 'Pages of Fixture Site | Kilotest');
  assert.ok(html.querySelector('a[href="/requestNewTestForm.html/s-fixtur"]'));
});

test('listPages lists each tested page of the site once, by name, with its URL', async () => {
  const result: any = await answer('s-fixtur');
  const links = getPageLinks(result.answerPage);
  assert.deepEqual(links.map(a => a.text), [
    'All CantTell Page',
    'Branch Coverage Page',
    'Empty Results Page',
    'Mixed Outcomes',
    'Multi Violator Page',
    'No Outcomes Page',
    'Prevented Page'
  ]);
  assert.ok(result.answerPage.includes('</a> (<code>https://example.com/mixed</code>)'));
  assert.ok(result.answerPage.includes('<p>To get test results, choose a page.</p>'));
  // A page with only hidden reports is not a tested page.
  assert.ok(!result.answerPage.includes('Hidden Page'));
});

test('listPages links each page to the issues in its latest report', async () => {
  const result: any = await answer('s-fixtur');
  const links = getPageLinks(result.answerPage);
  assert.equal(links.find(a => a.text === 'Mixed Outcomes')?.getAttribute('href'), '/listIssues.html/260202T0000-new');
  assert.equal(links.find(a => a.text === 'All CantTell Page')?.getAttribute('href'), '/listIssues.html/260101T0001-ct');
});

test('listPages reports a site with no tested pages, and refuses a nonexistent or malformed site', async () => {
  const registryPath = path.join(fixtureDBDir, 'registry.json');
  const original = await fs.readFile(registryPath, 'utf8');
  try {
    const registry = JSON.parse(original);
    registry.sites['s-untest'] = 'Untested <Site>';
    await fs.writeFile(registryPath, JSON.stringify(registry));
    const result: any = await answer('s-untest');
    assert.ok(result.answerPage.includes('<p>No pages of this site have been tested yet.</p>'));
    assert.ok(result.answerPage.includes('Untested &lt;Site&gt;'));
  }
  finally {
    await fs.writeFile(registryPath, original);
  }
  for (const siteID of ['s-zzzzzz', 'nonsense']) {
    assert.deepEqual(await answer(siteID), {status: 'error', message: 'Request for a nonexistent site'});
  }
});

test('listPages shows the pages of the site requested for testing, but not those of other sites', async () => {
  const request = (target: unknown) => ({
    id: 'q-aaaaaa', timeStamp: '260101T0000', target, reason: 'A reason', referred: false, possibleDuplicates: [], similarSites: []
  });
  try {
    assert.ok(!(await answer('s-fixtur') as any).answerPage.includes('Requested for testing'));
    await fs.writeFile(path.join(fixtureDBDir, 'jobs', 'testRequests.json'), JSON.stringify({
      'https://example.com/about': [request({siteID: 's-fixtur', pageName: 'About <Us>', url: 'https://example.com/about'})],
      'https://example.com/mixed': [request({pageID: 'p-mixedout'})],
      'https://other.example/': [
        request({siteID: 's-others', pageName: 'Other', url: 'https://other.example/'}),
        request({siteName: 'New Org', pageName: 'home', url: 'https://other.example/'}),
        request({pageID: 'p-zzzzzzzz'})
      ]
    }));
    const registryPath = path.join(fixtureDBDir, 'registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    registry.pages['p-newpagex'] = {sites: ['s-fixtur'], name: 'New Page', url: 'https://example.com/new-page'};
    registry.sites['s-others'] = 'Other Site';
    registry.pages['p-otherpg'] = {sites: ['s-others'], name: 'Other Page', url: 'https://other.example/'};
    await fs.writeFile(registryPath, JSON.stringify(registry));
    writeFixtureJob('queue', 'new', {sources: {pageID: 'p-newpagex'}, target: {url: 'https://example.com/new-page'}});
    writeFixtureJob('claimed', 'retest', {sources: {pageID: 'p-branchco'}, target: {url: 'https://example.com/branch'}});
    writeFixtureJob('queue', 'other', {sources: {pageID: 'p-otherpg'}, target: {url: 'https://other.example/'}});
    writeFixtureJob('queue', 'old', {target: {url: 'https://old.example/'}});
    const result: any = await answer('s-fixtur');
    const items = parse(result.answerPage).querySelectorAll('main > h2 + ul')[0]?.querySelectorAll('li').map(li => li.text);
    assert.deepEqual(items, [
      'About <Us> (https://example.com/about): new page, awaiting approval',
      'Mixed Outcomes (https://example.com/mixed): retest, awaiting approval',
      'New Page (https://example.com/new-page): new page, queued for testing',
      'Branch Coverage Page (https://example.com/branch): retest, being tested'
    ]);
    assert.ok(result.answerPage.includes('About &lt;Us&gt;'));
  }
  finally {
    resetRequestState();
  }
});
