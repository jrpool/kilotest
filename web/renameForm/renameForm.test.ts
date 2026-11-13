/*
  renameForm.test.ts
  Unit tests for web/renameForm/index.ts.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {getRegistry, registerPage, registryPath} from '../../registry.ts';
import {fixtureDBDir} from '../../test/dbFixture.ts';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
let savedRegistryJSON = '';
const siteID = 's-fixtur';
const pageID = 'p-mixedout';

// Returns the body of a submission of the form for the fixture site.
const getBody = (fields: Record<string, string>, authCode = 'test-auth-code'): string =>
  new URLSearchParams({siteID, siteName: 'Fixture Site', authCode, ...fields}).toString();

before(async () => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
  savedRegistryJSON = await fs.readFile(registryPath(), 'utf8');
});

after(async () => {
  // Restore the registry.
  await fs.writeFile(registryPath(), savedRegistryJSON);
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('renameForm lists the sites on a GET request without a site identifier', async () => {
  const result: any = await answer('', '', 'GET');
  assert.equal(result.status, 'ok');
  const link = parse(result.answerPage).querySelector(`a[href="/renameForm.html/${siteID}"]`);
  assert.equal(link?.text, 'Fixture Site');
});

test('renameForm displays the names of a site and its pages on a GET request', async () => {
  const result: any = await answer(siteID, '', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('input[name="siteName"]')?.getAttribute('value'), 'Fixture Site');
  assert.equal(html.querySelector(`input[name="page.${pageID}"]`)?.getAttribute('value'), 'Mixed Outcomes');
  assert.equal(html.querySelector(`label[for="${pageID}"] a`)?.getAttribute('href'), 'https://example.com/mixed');
  const pageCount = Object.keys((await getRegistry()).pages).length;
  assert.equal(html.querySelectorAll('fieldset input').length, pageCount);
});

test('renameForm returns an error for a nonexistent or invalid site on a GET request', async () => {
  for (const tail of ['s-absent', 'nonsense']) {
    const result: any = await answer(tail, '', 'GET');
    assert.equal(result.status, 'error');
  }
});

test('renameForm ignores a query string on a GET request', async () => {
  const result: any = await answer(siteID, getBody({[`page.${pageID}`]: 'Changed'}), 'GET');
  assert.equal(result.status, 'ok');
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('renameForm returns an error for an invalid auth code or site identifier on a POST request', async () => {
  const badCode: any = await answer('', getBody({[`page.${pageID}`]: 'Changed'}, 'wrong'), 'POST');
  assert.deepEqual(badCode, {status: 'error', message: 'Invalid request'});
  const badSite: any = await answer('', getBody({siteID: 'nonsense'}), 'POST');
  assert.deepEqual(badSite, {status: 'error', message: 'Invalid request'});
  const noSite: any = await answer('', 'authCode=test-auth-code', 'POST');
  assert.deepEqual(noSite, {status: 'error', message: 'Invalid request'});
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('renameForm refuses names of invalid lengths and conflicting names on a POST request', async () => {
  const empty: any = await answer('', getBody({[`page.${pageID}`]: '  '}), 'POST');
  assert.equal(empty.status, 'error');
  assert.ok(empty.message.includes('page name'));
  const long: any = await answer('', getBody({siteName: 'x'.repeat(81)}), 'POST');
  assert.equal(long.status, 'error');
  assert.ok(long.message.includes('site name'));
  const duplicate: any = await answer('', getBody({[`page.${pageID}`]: 'all canttell page'}), 'POST');
  assert.equal(duplicate.status, 'error');
  assert.ok(duplicate.message.includes('two pages would be named'));
  await registerPage({siteName: 'Other Site', pageName: 'home', url: 'https://other.example.com/'});
  const namesake: any = await answer('', getBody({siteName: 'other-site'}), 'POST');
  assert.equal(namesake.status, 'error');
  assert.ok(namesake.message.includes('too similar to that of the site “Other Site”'));
  const absentPage: any = await answer('', getBody({'page.p-absent00': 'Name'}), 'POST');
  assert.equal(absentPage.status, 'error');
  assert.ok(absentPage.message.includes('does not belong'));
  const absentSite: any = await answer('', getBody({siteID: 's-absent'}), 'POST');
  assert.equal(absentSite.status, 'error');
  assert.ok(absentSite.message.includes('site does not exist'));
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('renameForm revises names with a valid auth code on a POST request and redisplays the form', async () => {
  const result: any = await answer(
    '', getBody({siteName: ' Fixture   Site 2 ', [`page.${pageID}`]: 'Mixed <Outcomes>'}), 'POST'
  );
  assert.equal(result.status, 'ok');
  const registry = await getRegistry();
  assert.equal(registry.sites[siteID], 'Fixture Site 2');
  assert.equal(registry.pages[pageID]?.name, 'Mixed <Outcomes>');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('[role="status"]')?.text, '2 names were revised.');
  assert.ok(result.answerPage.includes('value="Mixed &lt;Outcomes&gt;"'));
  // An unchanged resubmission and a single change are reported accordingly.
  const unchanged: any = await answer('', getBody({siteName: 'Fixture Site 2'}), 'POST');
  assert.equal(parse(unchanged.answerPage).querySelector('[role="status"]')?.text, 'No names were revised.');
  const single: any = await answer('', getBody({siteName: 'Fixture Site'}), 'POST');
  assert.equal(parse(single.answerPage).querySelector('[role="status"]')?.text, '1 name was revised.');
  // A submission without a site name revises only page names.
  const pageOnly: any = await answer(
    '', `siteID=${siteID}&authCode=test-auth-code&page.${pageID}=Mixed%20Outcomes`, 'POST'
  );
  assert.equal(parse(pageOnly.answerPage).querySelector('[role="status"]')?.text, '1 name was revised.');
  assert.equal((await getRegistry()).sites[siteID], 'Fixture Site');
});
