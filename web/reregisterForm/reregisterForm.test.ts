/*
  reregisterForm.test.ts
  Unit tests for web/reregisterForm/index.ts.
*/

// IMPORTS

import {test, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parse} from 'node-html-parser';
import {answer} from './index.ts';
import {getRegistry, getSitePages, registerPage, registryPath} from '../../registry.ts';
import {fixtureDBDir} from '../../test/dbFixture.ts';

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
const savedDBDir = process.env.DB_DIR;
let savedRegistryJSON = '';
const siteID = 's-fixtur';
const pageID = 'p-mixedout';
const pageURL = 'https://example.com/mixed';

// Returns the body of a submission of the form for the fixture site.
const getBody = (fields: Record<string, string>, authCode = 'test-auth-code'): string =>
  new URLSearchParams({siteID, siteName: 'Fixture Site', authCode, ...fields}).toString();
// Returns the text of the message of a given type in an answer page.
const getMessage = (result: any, type: 'status' | 'alert'): string | undefined =>
  parse(result.answerPage).querySelector(`[role="${type}"]`)?.text;

before(async () => {
  process.env.AUTH_CODE = 'test-auth-code';
  process.env.DB_DIR = fixtureDBDir;
  savedRegistryJSON = await fs.readFile(registryPath(), 'utf8');
});

// Restore the registry after each test, so that no test depends on the order of the tests.
afterEach(async () => {
  await fs.writeFile(registryPath(), savedRegistryJSON);
});

after(() => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
});

// TESTS

test('reregisterForm lists the sites on a GET request without a site identifier', async () => {
  const result: any = await answer('', '', 'GET');
  assert.equal(result.status, 'ok');
  const link = parse(result.answerPage).querySelector(`a[href="/reregisterForm.html/${siteID}"]`);
  assert.equal(link?.text, 'Fixture Site');
});

test('reregisterForm displays the registrations of a site and its pages on a GET request', async () => {
  const result: any = await answer(siteID, '', 'GET');
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('input[name="siteName"]')?.getAttribute('value'), 'Fixture Site');
  assert.equal(html.querySelector(`input[name="name.${pageID}"]`)?.getAttribute('value'), 'Mixed Outcomes');
  assert.equal(html.querySelector(`input[name="url.${pageID}"]`)?.getAttribute('value'), pageURL);
  // Each page has a group labeled with its serial number in the order of the URLs, containing 2 inputs and a link to the page.
  const orderedIDs = getSitePages(await getRegistry(), siteID)
  .sort(([, a], [, b]) => a.url.localeCompare(b.url))
  .map(([id]) => id);
  const groups = html.querySelectorAll('fieldset');
  assert.equal(groups.length, orderedIDs.length);
  const group = groups[orderedIDs.indexOf(pageID)];
  const serial = orderedIDs.indexOf(pageID) + 1;
  assert.equal(group?.querySelector('legend')?.text, `page ${serial}`);
  assert.equal(group?.querySelectorAll('input').length, 2);
  assert.equal(group?.querySelector('a')?.getAttribute('href'), pageURL);
  assert.equal(group?.querySelector('a')?.text, `Open page ${serial} (Mixed Outcomes)`);
});

test('reregisterForm returns an error for a nonexistent or invalid site on a GET request', async () => {
  for (const tail of ['s-absent', 'nonsense']) {
    const result: any = await answer(tail, '', 'GET');
    assert.equal(result.status, 'error');
  }
});

test('reregisterForm ignores a query string on a GET request', async () => {
  const result: any = await answer(siteID, getBody({[`name.${pageID}`]: 'Changed'}), 'GET');
  assert.equal(result.status, 'ok');
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('reregisterForm returns an error for an invalid auth code or site on a POST request', async () => {
  const badCode: any = await answer('', getBody({[`name.${pageID}`]: 'Changed'}, 'wrong'), 'POST');
  assert.deepEqual(badCode, {status: 'error', message: 'Invalid request'});
  const badSite: any = await answer('', getBody({siteID: 'nonsense'}), 'POST');
  assert.deepEqual(badSite, {status: 'error', message: 'Invalid request'});
  const noSite: any = await answer('', 'authCode=test-auth-code', 'POST');
  assert.deepEqual(noSite, {status: 'error', message: 'Invalid request'});
  const absentSite: any = await answer('', getBody({siteID: 's-absent'}), 'POST');
  assert.deepEqual(absentSite, {status: 'error', message: 'Request for nonexistent site'});
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('reregisterForm returns an error for a submitted page that is not a page of the site', async () => {
  const result: any = await answer('', getBody({'url.p-absent00': pageURL, [`name.${pageID}`]: 'Changed', [`url.${pageID}`]: pageURL}), 'POST');
  assert.deepEqual(result, {status: 'error', message: 'Request for nonexistent site or page'});
  assert.equal((await getRegistry()).pages[pageID]?.name, 'Mixed Outcomes');
});

test('reregisterForm redisplays the form with the submitted values and the first error', async () => {
  const serial = getSitePages(await getRegistry(), siteID)
  .sort(([, a], [, b]) => a.url.localeCompare(b.url))
  .findIndex(([id]) => id === pageID) + 1;
  await registerPage({siteName: 'Other Site', pageName: 'home', url: 'https://other.example.com/'});
  const cases: [Record<string, string>, string][] = [
    [{siteName: 'x'.repeat(81)}, 'Nothing was revised. The site name must be between 1 and 80 characters long.'],
    [{[`name.${pageID}`]: '  '}, `Nothing was revised. The name of page ${serial} must be between 1 and 120 characters long.`],
    [
      {[`url.${pageID}`]: 'http://example.com/mixed'},
      `Nothing was revised. The URL of page ${serial} must start with https:// and be between 12 and 300 characters long.`
    ],
    [
      {[`url.${pageID}`]: 'https://a.i'},
      `Nothing was revised. The URL of page ${serial} must start with https:// and be between 12 and 300 characters long.`
    ],
    [
      {[`url.${pageID}`]: `https://example.com/${'x'.repeat(300)}`},
      `Nothing was revised. The URL of page ${serial} must start with https:// and be between 12 and 300 characters long.`
    ],
    [{siteName: 'other-site'}, 'Nothing was revised. The site name is too similar to that of the site “Other Site”.'],
    [
      {[`name.${pageID}`]: 'Kept <edit>'},
      'Nothing was revised. Two pages would be named “Kept <edit>”.'
    ],
    [
      {[`url.${pageID}`]: 'https://www.example.com/CantTell/'},
      `Nothing was revised. The URL of page ${serial} is equivalent to that of the page “Fixture Site All CantTell Page”.`
    ],
    [
      {[`url.${pageID}`]: 'https://www.other.example.com'},
      `Nothing was revised. The URL of page ${serial} is equivalent to that of the page “Other Site home”.`
    ]
  ];
  for (const [fields, message] of cases) {
    const body = getBody({
      'name.p-canttell': 'Kept <edit>',
      'url.p-canttell': 'https://example.com/canttell',
      [`name.${pageID}`]: 'Mixed Outcomes',
      [`url.${pageID}`]: pageURL,
      ...fields
    });
    const result: any = await answer('', body, 'POST');
    assert.equal(result.status, 'ok');
    assert.equal(getMessage(result, 'alert'), message);
    // The submitted values, including valid ones, are redisplayed.
    const html = parse(result.answerPage);
    assert.equal(html.querySelector('input[name="name.p-canttell"]')?.getAttribute('value'), 'Kept <edit>');
    assert.ok(result.answerPage.includes('value="Kept &lt;edit&gt;"'));
    for (const [name, value] of Object.entries(fields)) {
      assert.equal(html.querySelector(`input[name="${name}"]`)?.getAttribute('value'), value.trim());
    }
    // Nothing is changed.
    const registry = await getRegistry();
    assert.equal(registry.sites[siteID], 'Fixture Site');
    assert.deepEqual(registry.pages[pageID], {sites: [siteID], name: 'Mixed Outcomes', url: pageURL});
    assert.equal(registry.pages['p-canttell']?.name, 'All CantTell Page');
  }
});

test('reregisterForm treats a name or URL submitted without the other as submitted with an empty one', async () => {
  const noURL: any = await answer('', getBody({[`name.${pageID}`]: 'Changed'}), 'POST');
  assert.match(getMessage(noURL, 'alert') ?? '', /The URL of page \d+ must start with https:/);
  const noName: any = await answer('', getBody({[`url.${pageID}`]: pageURL}), 'POST');
  assert.match(getMessage(noName, 'alert') ?? '', /The name of page \d+ must be between/);
});

test('reregisterForm refuses a revised URL that is not an allowed target, but not an unrevised one', async () => {
  const savedAllowance = process.env.ALLOW_INTERNAL_TARGETS;
  process.env.ALLOW_INTERNAL_TARGETS = '';
  try {
    const registryJSON = savedRegistryJSON.replace(pageURL, 'https://127.0.0.1/mixed');
    assert.notEqual(registryJSON, savedRegistryJSON);
    await fs.writeFile(registryPath(), registryJSON);
    const unrevised: any = await answer(
      '', getBody({[`name.${pageID}`]: 'Changed', [`url.${pageID}`]: 'https://127.0.0.1/mixed'}), 'POST'
    );
    assert.equal(getMessage(unrevised, 'status'), '1 value was revised.');
    const revised: any = await answer(
      '', getBody({[`name.${pageID}`]: 'Changed', [`url.${pageID}`]: 'https://127.0.0.1/other'}), 'POST'
    );
    assert.match(getMessage(revised, 'alert') ?? '', /^Nothing was revised\. The URL of page \d+ is not one that Kilotest is allowed to test\.$/);
    assert.equal((await getRegistry()).pages[pageID]?.url, 'https://127.0.0.1/mixed');
  }
  finally {
    process.env.ALLOW_INTERNAL_TARGETS = savedAllowance;
  }
});

test('reregisterForm revises registrations with a valid auth code on a POST request and redisplays the form', async () => {
  const result: any = await answer('', getBody({
    siteName: ' Fixture   Site 2 ', [`name.${pageID}`]: 'Mixed <Outcomes>', [`url.${pageID}`]: ' https://example.com/mixed-2 '
  }), 'POST');
  assert.equal(result.status, 'ok');
  const registry = await getRegistry();
  assert.equal(registry.sites[siteID], 'Fixture Site 2');
  assert.deepEqual(registry.pages[pageID], {sites: [siteID], name: 'Mixed <Outcomes>', url: 'https://example.com/mixed-2'});
  assert.equal(getMessage(result, 'status'), '3 values were revised.');
  assert.ok(result.answerPage.includes('value="Mixed &lt;Outcomes&gt;"'));
  assert.ok(result.answerPage.includes('<a href="https://example.com/mixed-2">'));
  // An unchanged resubmission and a single change are reported accordingly.
  const unchanged: any = await answer('', getBody({siteName: 'Fixture Site 2'}), 'POST');
  assert.equal(getMessage(unchanged, 'status'), 'No values were revised.');
  // A submission without a site name leaves the site name unchanged.
  const single: any = await answer(
    '', `siteID=${siteID}&authCode=test-auth-code&name.${pageID}=Mixed&url.${pageID}=https%3A%2F%2Fexample.com%2Fmixed-2`, 'POST'
  );
  assert.equal(getMessage(single, 'status'), '1 value was revised.');
  assert.equal((await getRegistry()).sites[siteID], 'Fixture Site 2');
});
