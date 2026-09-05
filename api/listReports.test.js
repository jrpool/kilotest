/*
  listReports.test.js
  Tests for api/listReports.js using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {response} = require('./listReports');

// CONSTANTS

// Fixture report identifiers in the reports/ directory (excluding the hidden one).
const fixtureIds = [
  ['260101T0000', 'mix'],
  ['260101T0001', 'ct'],
  ['260101T0002', 'no'],
  ['260101T0005', 'emp'],
  ['260101T0006', 'prv'],
  ['260202T0000', 'new']
];

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'db');
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

test('listReports returns basics about all 6 non-hidden reports', async () => {
  const body = await response();
  const reportsBasics = body['response content']['basics about all available reports'];
  assert.equal(reportsBasics.length, 6);
  const ids = reportsBasics.map(b => b.identifier).sort();
  const expectedIds = fixtureIds.map(([ts, jid]) => `${ts}-${jid}`).sort();
  assert.deepEqual(ids, expectedIds);
});

test('listReports does not include the hidden report', async () => {
  const body = await response();
  const reportsBasics = body['response content']['basics about all available reports'];
  const ids = reportsBasics.map(b => b.identifier);
  assert.ok(!ids.includes('260101T0007-hid'), 'hidden report must not appear in listReports');
});

test('listReports sorts reports by page description and then by completion time', async () => {
  const body = await response();
  const reportsBasics = body['response content']['basics about all available reports'];
  const descriptions = reportsBasics.map(b => b['tested web page'].description);
  // All CantTell Page, Empty Results Page, Mixed Outcomes Page, Mixed Outcomes Page, No Outcomes Page, Prevented Page.
  assert.deepEqual(
    descriptions,
    [
      'All CantTell Page',
      'Empty Results Page',
      'Mixed Outcomes Page',
      'Mixed Outcomes Page',
      'No Outcomes Page',
      'Prevented Page'
    ]
  );
  // The two Mixed Outcomes Page reports should be sorted by completion time (older first).
  const mixedReports = reportsBasics.filter(b => b['tested web page'].description === 'Mixed Outcomes Page');
  assert.equal(mixedReports[0].identifier, '260101T0000-mix');
  assert.equal(mixedReports[1].identifier, '260202T0000-new');
});

test('listReports marks the superseded report correctly', async () => {
  const body = await response();
  const reportsBasics = body['response content']['basics about all available reports'];
  const mix = reportsBasics.find(b => b.identifier === '260101T0000-mix');
  const newer = reportsBasics.find(b => b.identifier === '260202T0000-new');
  assert.equal(mix['whether a later report about the same page exists'], true);
  assert.equal(newer['whether a later report about the same page exists'], false);
});

test('listReports includes request-test instructions', async () => {
  const body = await response();
  const content = body['response content'];
  assert.ok(content['how to request that a page with no report be tested']);
  assert.ok(content['how a web user can request that the page be tested']);
  assert.equal(content['how to request that a page with no report be tested'].method, 'POST');
});

test('listReports includes tool name and metadata', async () => {
  const body = await response();
  assert.equal(body['tool name'], 'listReports');
  assert.ok(body['response metadata'].identifier);
  assert.ok(body['response metadata']['date and time']);
});
