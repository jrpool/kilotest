/*
  propose-site-mapping.test.ts
  Tests for scripts/propose-site-mapping.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getDomain, getPageRecords, getSiteKey, normalizeName, proposeMapping} from './propose-site-mapping.ts';
import type {PageRecord} from './propose-site-mapping.ts';

// FUNCTIONS

// Returns a page record with one available report per URL.
const getRecord = (description: string, ...urls: string[]): PageRecord => ({
  description,
  urls,
  reportIDs: urls.map((url, index) => `${description}-${index}`),
  hiddenReportIDs: []
});
// Returns the proposal for a description.
const getProposal = (records: PageRecord[], description: string) => {
  const proposal = proposeMapping(records).find(item => item.description === description);
  assert.ok(proposal, `no proposal for ${description}`);
  return proposal;
};
// Returns the flag codes of the proposal for a description.
const getCodes = (records: PageRecord[], description: string) => getProposal(records, description)
.flags
.map(flag => flag.code);

// TESTS

test('normalizeName unifies apostrophes, quotation marks, white space, and case', () => {
  assert.equal(normalizeName('  Women’s  “Liberation” Front '), 'women\'s "liberation" front');
});
test('getSiteKey ignores parenthesized parts and punctuation', () => {
  assert.equal(
    getSiteKey('Foundation for Individual Rights and Expression (FIRE)'),
    getSiteKey('Foundation for Individual Rights and Expression')
  );
  assert.equal(getSiteKey('DEPLOY/US'), 'deployus');
});
test('getDomain approximates registrable domains', () => {
  assert.equal(getDomain('www.example.org'), 'example.org');
  assert.equal(getDomain('give.catf.us'), 'catf.us');
  assert.equal(getDomain('shop.example.co.uk'), 'example.co.uk');
});
test('proposeMapping makes an unprefixed description a home page and a prefixed one a page of its site', () => {
  const records = [
    getRecord('Farm Sanctuary', 'https://www.farmsanctuary.org/'),
    getRecord('Farm Sanctuary contact', 'https://www.farmsanctuary.org/contact')
  ];
  const home = getProposal(records, 'Farm Sanctuary');
  const contact = getProposal(records, 'Farm Sanctuary contact');
  assert.deepEqual([home.site, home.page, home.flags], ['Farm Sanctuary', 'home', []]);
  assert.deepEqual([contact.site, contact.page, contact.flags], ['Farm Sanctuary', 'contact', []]);
});
test('proposeMapping sorts by site with the home page first', () => {
  const records = [
    getRecord('B site', 'https://b.org/'),
    getRecord('A site contact', 'https://a.org/contact'),
    getRecord('A site', 'https://a.org/'),
    getRecord('A site about', 'https://a.org/about')
  ];
  assert.deepEqual(
    proposeMapping(records).map(proposal => proposal.description),
    ['A site', 'A site about', 'A site contact', 'B site']
  );
});
test('proposeMapping follows a chain of prefixes to its root and flags the chain', () => {
  const records = [
    getRecord('Portland State University', 'https://www.pdx.edu/'),
    getRecord('Portland State University Senior Adult Learning Center', 'https://www.pdx.edu/salc/'),
    getRecord('Portland State University Senior Adult Learning Center join', 'https://www.pdx.edu/salc/join')
  ];
  const proposal = getProposal(records, 'Portland State University Senior Adult Learning Center join');
  assert.equal(proposal.site, 'Portland State University');
  assert.equal(proposal.page, 'Senior Adult Learning Center join');
  assert.deepEqual(proposal.flags.map(flag => flag.code), ['chainedPrefix']);
});
test('proposeMapping does not treat a parenthesized remainder as a page name', () => {
  const records = [
    getRecord('Foundation for Individual Rights and Expression', 'https://www.fire.org/'),
    getRecord('Foundation for Individual Rights and Expression (FIRE)', 'https://www.thefire.org/'),
    getRecord('Foundation for Individual Rights and Expression (FIRE) mission', 'https://www.thefire.org/mission/')
  ];
  const fire = getProposal(records, 'Foundation for Individual Rights and Expression (FIRE)');
  assert.equal(fire.page, 'home');
  assert.deepEqual(fire.flags.map(flag => flag.code), ['nearDuplicateSite']);
  assert.equal(getProposal(records, 'Foundation for Individual Rights and Expression (FIRE) mission').site, fire.site);
  assert.deepEqual(getCodes(records, 'Foundation for Individual Rights and Expression'), ['nearDuplicateSite']);
});
test('proposeMapping matches apostrophe variants and flags them', () => {
  const records = [
    getRecord('Women\'s Liberation Front', 'https://womensliberationfront.org/'),
    getRecord('Women’s Liberation Front Sisterhood application', 'https://action.womensliberationfront.org/apply')
  ];
  const proposal = getProposal(records, 'Women’s Liberation Front Sisterhood application');
  assert.equal(proposal.site, 'Women\'s Liberation Front');
  assert.equal(proposal.page, 'Sisterhood application');
  assert.deepEqual(proposal.flags.map(flag => flag.code), ['variantSpelling']);
});
test('proposeMapping flags a home page whose URL has a path', () => {
  const records = [getRecord('Koenig Childhood Cancer Foundation donations', 'https://thekccf.org/donate')];
  assert.deepEqual(getCodes(records, 'Koenig Childhood Cancer Foundation donations'), ['notHomeURL']);
});
test('proposeMapping flags a page on another domain from its site', () => {
  const records = [
    getRecord('CVS', 'https://www.cvs.com/'),
    getRecord('CVS Health', 'https://www.cvshealth.com/')
  ];
  assert.deepEqual(getCodes(records, 'CVS Health'), ['otherHost']);
});
test('proposeMapping flags sites whose home pages share a domain', () => {
  const records = [
    getRecord('Portland State University', 'https://www.pdx.edu/'),
    getRecord('Jordan Schnitzer Museum of Art at PSU', 'https://www.pdx.edu/museum-of-art/')
  ];
  assert.deepEqual(getCodes(records, 'Portland State University'), ['sharedDomain']);
  assert.deepEqual(getCodes(records, 'Jordan Schnitzer Museum of Art at PSU'), ['notHomeURL', 'sharedDomain']);
});
test('proposeMapping flags multiple URLs, shared URLs, and hidden-only pages', () => {
  const records = [
    getRecord('Example', 'https://example.com/', 'https://example.org/'),
    getRecord('Sample', 'https://www.example.com'),
    {description: 'Gone', urls: ['https://gone.example/'], reportIDs: [], hiddenReportIDs: ['x']}
  ];
  assert.deepEqual(getCodes(records, 'Example'), ['multipleURLs', 'sharedURL', 'sharedDomain']);
  assert.deepEqual(getCodes(records, 'Sample'), ['sharedURL', 'sharedDomain']);
  assert.deepEqual(getCodes(records, 'Gone'), ['hiddenOnly']);
});
test('getPageRecords reads reports and hidden reports and skips unusable files', () => {
  const savedDBDir = process.env.DB_DIR;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-mapping-'));
  try {
    fs.mkdirSync(path.join(dbDir, 'reports'));
    fs.mkdirSync(path.join(dbDir, 'hiddenReports'));
    const target = {what: 'Example', url: 'https://example.com/'};
    fs.writeFileSync(path.join(dbDir, 'reports', 'a.json'), JSON.stringify({target}));
    fs.writeFileSync(path.join(dbDir, 'hiddenReports', 'b.json'), JSON.stringify({target}));
    fs.writeFileSync(path.join(dbDir, 'reports', 'c.json'), '{');
    fs.writeFileSync(path.join(dbDir, 'reports', 'd.json'), JSON.stringify({target: {what: ''}}));
    process.env.DB_DIR = dbDir;
    const result = getPageRecords();
    assert.equal(result.reportFileCount, 3);
    assert.equal(result.hiddenReportFileCount, 1);
    assert.equal(result.skipped.length, 2);
    assert.deepEqual(result.records, [
      {description: 'Example', urls: ['https://example.com/'], reportIDs: ['a'], hiddenReportIDs: ['b']}
    ]);
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
});
