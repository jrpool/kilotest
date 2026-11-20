/*
  listTopIssues.test.ts
  UI tests for web/listTopIssues/index.ts, using a mocked rule classification and mocked violation data, so that their results depend neither on the classification in the testaro-issues dependency nor on the annotations of the fixture reports.
*/

// IMPORTS

import {test, afterEach, mock} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {mockClassification} from '../../test/fixtures/classification.ts';
import {fixtureViolationData} from '../../test/fixtures/violationData.ts';

// Mock the rule classification before importing any module that imports it.
mockClassification();
const realUtil = await import('../../util.ts');
// The result that the mocked getViolationData returns, replaceable by a test to create an error.
let violationDataResult: Awaited<ReturnType<typeof realUtil.getViolationData>> = fixtureViolationData;
// Mock getViolationData before importing index.ts, so that it imports the mocked version. Other exports delegate to the real module.
mock.module('../../util.ts', {
  exports: {
    ...realUtil,
    getViolationData: async () => violationDataResult
  }
} as any);

const {answer} = await import('./index.ts') as any;

// Returns the text of the items of the issue list under the heading of a priority.
const getPriorityItems = (html: ReturnType<typeof parse>, priority: string): string[] => {
  const heading = html.querySelectorAll('h2').find(h2 => h2.text === `${priority} priority`)!;
  const list = heading.nextElementSibling!;
  return list.querySelectorAll(':scope > li').map(item => item.text.replace(/\s+/g, ' ').trim());
};

// SETUP AND TEARDOWN

afterEach(() => {
  violationDataResult = fixtureViolationData;
});

// TESTS

test('listTopIssues returns an ok status with valid HTML', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
  assert.match(html.querySelector('main p')!.text, /^These are the issues reported most often\./);
});

test('listTopIssues lists issues by priority with their shares and reporters', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  const highest = getPriorityItems(html, 'highest');
  assert.equal(highest.length, 1);
  assert.match(highest[0]!, /^mock issue A /);
  assert.match(highest[0]!, /Share of violations: 97%/);
  assert.match(highest[0]!, /Violations reported by Alfa \+ Axe/);
  const lowest = getPriorityItems(html, 'lowest');
  assert.equal(lowest.length, 1);
  assert.match(lowest[0]!, /^mock issue B /);
  assert.match(lowest[0]!, /Share of violations: 2%/);
  assert.match(lowest[0]!, /Violations reported by Axe \+ Html Checker API/);
});

test('listTopIssues excludes cantTell instances from issue counts', async () => {
  // The fixture data include 52 cantTell instances of a mockIssueA rule. If they were counted, the share of mockIssueA would not be 97%.
  const result: any = await answer();
  assert.match(result.answerPage, /Share of violations: 97%/);
});

test('listTopIssues excludes the ignorable issue', async () => {
  // The fixture data include 1000 violations of an ignorable rule. If they were counted, the share of mockIssueA would not be 97%, and the ignorable issue would be listed.
  const result: any = await answer();
  assert.match(result.answerPage, /Share of violations: 97%/);
  assert.ok(!result.answerPage.includes('No known impact'));
});

test('listTopIssues omits issues with shares below 2% and says so for a priority with none', async () => {
  const result: any = await answer();
  assert.ok(!result.answerPage.includes('mock issue C'));
  const html = parse(result.answerPage);
  const heading = html.querySelectorAll('h2').find(h2 => h2.text === 'high priority')!;
  assert.equal(heading.nextElementSibling!.nextElementSibling!.text, 'No issues with this priority.');
});

test('listTopIssues lists no issues when there are no reports', async () => {
  violationDataResult = [];
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  assert.equal(result.answerPage.match(/No issues with this priority\./g).length, 4);
});

test('listTopIssues states that the data are unavailable when reports need reannotation', async () => {
  violationDataResult = {error: realUtil.reannotationNeededMessage};
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('main p')!.text, `${realUtil.reannotationNeededMessage}.`);
  assert.equal(html.querySelectorAll('h2').length, 0);
});

test('listTopIssues returns an error when the violation data cannot be compiled', async () => {
  violationDataResult = {error: 'Report is invalid (test override)'};
  const result: any = await answer();
  assert.deepEqual(result, {status: 'error', message: 'Report is invalid (test override)'});
});
