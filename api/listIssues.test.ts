/*
  listIssues.test.ts
  Tests for api/listIssues.ts using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {response} from './listIssues.ts';

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

test('listIssues returns 2 issues for the mixed-outcomes report, excluding cantTell', async () => {
  const body = await response(['260101T0000', 'mix']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.ok(issues);
  assert.equal(issues.length, 2);
  const summaries = issues.map((i: any) => i.summary).sort();
  assert.deepEqual(summaries, ['all-capital text', 'link not named']);
});

test('listIssues returns 0 issues for the all-cantTell report', async () => {
  const body = await response(['260101T0001', 'ct']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.ok(issues);
  assert.equal(issues.length, 0);
});

test('listIssues treats missing outcome as a violation, not cantTell', async () => {
  const body = await response(['260101T0002', 'no']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.ok(issues);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.identifier, 'linkNoText');
});

test('listIssues returns 0 issues for the empty report', async () => {
  const body = await response(['260101T0005', 'emp']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.ok(issues);
  assert.equal(issues.length, 0);
});

test('listIssues reports prevented rule engines for the prevented report', async () => {
  const body = await response(['260101T0006', 'prv']);
  const details = body['response content']['details about the report'] as any;
  const preventions = details['test results']['rule engines that could not test the page'];
  assert.equal(preventions.length, 1);
  assert.equal(preventions[0].name, 'Alfa');
  assert.equal(preventions[0]['reason for failure'], 'page timed out');
});

test('listIssues includes reporter names for each issue in the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.ok(issues);
  const linkIssue = issues.find(i => i.identifier === 'linkNoText');
  assert.ok(linkIssue);
  assert.deepEqual(linkIssue['rule engines with any violations belonging to the issue'], ['Alfa', 'Axe']);
  const allCapsIssue = issues.find(i => i.identifier === 'allCaps');
  assert.ok(allCapsIssue);
  assert.deepEqual(allCapsIssue['rule engines with any violations belonging to the issue'], ['Alfa']);
});

test('listIssues counts issues by priority correctly for the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const details = body['response content']['details about the report'] as any;
  const counts = details['test results']['counts of issues by priority'];
  // linkNoText weight 4 (highest), allCaps weight 1 (lowest).
  assert.equal(counts.highest, 1);
  assert.equal(counts.high, 0);
  assert.equal(counts.low, 0);
  assert.equal(counts.lowest, 1);
});

test('listIssues reports the superseded status for the mixed report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const basics = body['response content']['basics about the report'] as any;
  assert.equal(basics['whether a later report about the same page exists'], true);
});

test('listIssues returns an error for a nonexistent report', async () => {
  const body = await response(['999999T9999', 'xyz']);
  const basics = body['response content']['basics about the report'] as any;
  assert.ok(basics.error);
});

test('listIssues handles instances with missing issueID and null instances without error', async () => {
  const body = await response(['260101T0009', 'brd']);
  const issues = body['response content']['basics about all issues reported in the report'];
  // The brd fixture has one instance with duplicateID (a valid issue) and one with no issueID (skipped).
  // The alfa act has no instances array, so it should be handled as empty.
  assert.ok(issues);
  assert.ok(issues.length >= 1);
  const ids = issues.map(i => i.identifier);
  assert.ok(ids.includes('duplicateID'));
});

test('listIssues lists the history of reports about the page, from oldest to latest', async () => {
  const body = await response(['260101T0000', 'mix']);
  const history = body['response content']['history of reports about the page']!;
  assert.deepEqual(history.map(entry => entry.identifier), ['260101T0000-mix', '260202T0000-new']);
  assert.deepEqual(
    history.map(entry => [
      entry['whether it is the oldest report about the page'],
      entry['whether it is the latest report about the page'],
      entry['whether it is the report described in this response']
    ]),
    [[true, false, true], [false, true, false]]
  );
  assert.equal(history[1]!['completion date and time'], '2026-02-02T00:10:00.000Z');
  assert.equal(typeof history[1]!['days since the report was completed'], 'number');
  assert.ok(history[1]!['how to get details about the report'].URL.endsWith('/api/listIssues/260202T0000/new'));
  assert.ok(history[1]!['web users can get details about the report at'].endsWith('/listIssues.html/260202T0000/new'));
});

test('listIssues gives a one-report history for the only report about a page', async () => {
  const body = await response(['260101T0001', 'ct']);
  const history = body['response content']['history of reports about the page']!;
  assert.equal(history.length, 1);
  assert.equal(history[0]!['whether it is the oldest report about the page'], true);
  assert.equal(history[0]!['whether it is the latest report about the page'], true);
  assert.equal(history[0]!['whether it is the report described in this response'], true);
});

test('listIssues gives no history for a nonexistent report', async () => {
  const body = await response(['999999T9999', 'xyz']);
  assert.equal(body['response content']['history of reports about the page'], null);
});
