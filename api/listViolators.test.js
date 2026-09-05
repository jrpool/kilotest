/*
  listViolators.test.js
  Tests for api/listViolators.js using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {response} = require('./listViolators');

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

test('listViolators returns 1 violator for linkNoText in the mixed report, excluding cantTell', async () => {
  const body = await response(['linkNoText', '260101T0000', 'mix']);
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  assert.equal(violators.length, 1);
  assert.equal(violators[0].identifier, '0');
  assert.equal(violators[0]['tag name'], 'A');
  assert.equal(violators[0]['inner text'], 'About Us');
  assert.equal(violators[0]['count of rule engines reporting that the element exhibited the issue'], 2);
});

test('listViolators returns 0 violators for an issue when all instances are cantTell', async () => {
  const body = await response(['focusIndicationBad', '260101T0001', 'ct']);
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  assert.equal(violators.length, 0);
});

test('listViolators treats missing outcome as a violation', async () => {
  const body = await response(['linkNoText', '260101T0002', 'no']);
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  assert.equal(violators.length, 1);
  assert.equal(violators[0].identifier, '0');
});

test('listViolators returns an error for an unknown issue ID', async () => {
  const body = await response(['nonexistentIssue', '260101T0000', 'mix']);
  const basics = body['response content']['basics about the issue'];
  assert.ok(basics.error);
});

test('listViolators returns an error for a nonexistent report', async () => {
  const body = await response(['linkNoText', '999999T9999', 'xyz']);
  const basics = body['response content']['basics about the report'];
  assert.ok(basics.error);
});

test('listViolators includes reporter facts for the issue', async () => {
  const body = await response(['linkNoText', '260101T0000', 'mix']);
  const details = body['response content']['details about the issue'];
  const reporters = details['rule engines reporting violations belonging to the issue'];
  const names = reporters.map(r => r.name).sort();
  assert.deepEqual(names, ['Alfa', 'Axe']);
});
