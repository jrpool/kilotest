// @ts-nocheck: transitional (not yet under strict type checking).
/*
  listViolators.test.ts
  Tests for api/listViolators.ts using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {response} from './listViolators.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../test/dbFixture.ts')).fixtureDBDir;
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

test('listViolators sorts by catalogIndex when two violators have the same reporter count', async () => {
  const body = await response(['linkNoText', '260101T0008', 'mul']);
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  assert.equal(violators.length, 3);
  // The violator with 2 reporters (catalogIndex 2) sorts first.
  assert.equal(violators[0].identifier, '2');
  assert.equal(violators[0]['count of rule engines reporting that the element exhibited the issue'], 2);
  // The two violators with 1 reporter each are sorted by catalogIndex ascending.
  assert.equal(violators[1].identifier, '0');
  assert.equal(violators[1]['count of rule engines reporting that the element exhibited the issue'], 1);
  assert.equal(violators[2].identifier, '1');
  assert.equal(violators[2]['count of rule engines reporting that the element exhibited the issue'], 1);
});

test('listViolators returns guideline layer for an issue with a short WCAG code', async () => {
  const body = await response(['duplicateID', '260101T0009', 'brd']);
  const issueBasics = body['response content']['basics about the issue'];
  assert.equal(issueBasics['related WCAG standard'].layer, 'guideline');
});

test('listViolators returns null tag name and text for a violator not in the catalog', async () => {
  const body = await response(['duplicateID', '260101T0009', 'brd']);
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  const orphan = violators.find(v => v.identifier === '3');
  assert.ok(orphan);
  assert.equal(orphan['tag name'], null);
  assert.equal(orphan['inner text'], null);
});

test('listViolators returns an error for a falsy issue ID', async () => {
  const body = await response(['', '260101T0009', 'brd']);
  const issueBasics = body['response content']['basics about the issue'];
  assert.ok(issueBasics.error);
});
