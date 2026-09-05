/*
  listIssues.test.js
  Tests for api/listIssues.js using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {response} = require('./listIssues');

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

test('listIssues returns 2 issues for the mixed-outcomes report, excluding cantTell', async () => {
  const body = await response(['260101T0000', 'mix']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 2);
  const summaries = issues.map(i => i.summary).sort();
  assert.deepEqual(summaries, ['all-capital text', 'link not named']);
});

test('listIssues returns 0 issues for the all-cantTell report', async () => {
  const body = await response(['260101T0001', 'ct']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 0);
});

test('listIssues treats missing outcome as a violation, not cantTell', async () => {
  const body = await response(['260101T0002', 'no']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 1);
  assert.equal(issues[0].identifier, 'linkNoText');
});

test('listIssues returns 0 issues for the empty report', async () => {
  const body = await response(['260101T0005', 'emp']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 0);
});

test('listIssues reports prevented rule engines for the prevented report', async () => {
  const body = await response(['260101T0006', 'prv']);
  const details = body['response content']['details about the report'];
  const preventions = details['test results']['rule engines that could not test the page'];
  assert.equal(preventions.length, 1);
  assert.equal(preventions[0].name, 'Alfa');
  assert.equal(preventions[0]['reason for failure'], 'page timed out');
});

test('listIssues includes reporter names for each issue in the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const issues = body['response content']['basics about all issues reported in the report'];
  const linkIssue = issues.find(i => i.identifier === 'linkNoText');
  assert.deepEqual(linkIssue['rule engines with any violations belonging to the issue'], ['Alfa', 'Axe']);
  const allCapsIssue = issues.find(i => i.identifier === 'allCaps');
  assert.deepEqual(allCapsIssue['rule engines with any violations belonging to the issue'], ['Alfa']);
});

test('listIssues counts issues by priority correctly for the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const details = body['response content']['details about the report'];
  const counts = details['test results']['counts of issues by priority'];
  // linkNoText weight 4 (highest), allCaps weight 1 (lowest).
  assert.equal(counts.highest, 1);
  assert.equal(counts.high, 0);
  assert.equal(counts.low, 0);
  assert.equal(counts.lowest, 1);
});

test('listIssues reports the superseded status for the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const basics = body['response content']['basics about the report'];
  assert.equal(basics['whether a later report about the same page exists'], true);
});

test('listIssues returns an error for a nonexistent report', async () => {
  const body = await response(['999999T9999', 'xyz']);
  const basics = body['response content']['basics about the report'];
  assert.ok(basics.error);
});
