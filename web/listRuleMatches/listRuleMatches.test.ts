/*
  listRuleMatches.test.ts
  Tests for web/listRuleMatches/index.ts, using a mocked rule classification and mocked violation data, so that their results depend neither on the classification in the testaro-issues dependency nor on the annotations of the fixture reports.
*/

// IMPORTS

import {test, afterEach, mock} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {mockClassification} from '../../test/fixtures/classification.ts';
import type {ReportExtract, ViolationData} from '../../util.ts';

// Mock the rule classification before importing any module that imports it.
mockClassification();
const realUtil = await import('../../util.ts');
// The result that the mocked getViolationData returns, replaceable by a test.
let violationDataResult: Awaited<ReturnType<typeof realUtil.getViolationData>> = [];
// Mock getViolationData before importing index.ts, so that it imports the mocked version. Other exports delegate to the real module.
mock.module('../../util.ts', {
  exports: {
    ...realUtil,
    getViolationData: async () => violationDataResult
  }
} as any);

const {answer, getRuleMatches, minSupportPages} = await import('./index.ts');

// FUNCTIONS

// Returns the extract of a report about a page on which the alfa, axe, nuVal, and testaro rule engines tried to test.
const getExtract = (id: string, overrides: Partial<ReportExtract> = {}): ReportExtract => ({
  id,
  pageID: `p-${id}`,
  description: `Page ${id}`,
  url: `https://example.com/${id}`,
  reportTime: '2026-01-01T00:10:00.000Z',
  ruleEngineIDs: ['alfa', 'axe', 'nuVal', 'testaro'],
  preventions: {},
  rulePreventions: {},
  ...overrides
});
// Returns the violation data of a rule on a page, with the specified violators and count of unlocated violations.
const violated = (violators: string[], unlocatedCount = 0) => ({
  failed: {violators: new Set(violators), count: violators.length + unlocatedCount, unlocatedCount},
  cantTell: {violators: new Set<string>(), count: 0, unlocatedCount: 0}
});
// Returns the violation data of a page.
const getPage = (
  id: string, violations: ViolationData['violations'], overrides: Partial<ReportExtract> = {}
): ViolationData => ({extract: getExtract(id, overrides), violations});
// Returns violation data on pages on each of which two rules were both violated by the same element.
const getAgreeingPages = (count: number, catalogIndex = '0'): ViolationData[] => Array.from(
  {length: count},
  (_, index) => getPage(`a${index}`, {axe: {a: violated([catalogIndex])}, alfa: {b: violated([catalogIndex])}})
);
// Returns the rule-engine and rule-key pairs of the sets of matching rules.
const getRuleSets = (data: ViolationData[], minSupport?: number) => getRuleMatches(data, minSupport).map(
  ({rules, supportPages}) => [rules.map(({engineID, ruleKey}) => `${engineID}:${ruleKey}`), supportPages]
);

// SETUP AND TEARDOWN

afterEach(() => {
  violationDataResult = [];
});

// TESTS OF THE COMPUTATION

test('getRuleMatches finds two rules of different engines violated by the same elements on enough pages', () => {
  assert.equal(minSupportPages, 3);
  assert.deepEqual(getRuleSets(getAgreeingPages(3)), [[['alfa:b', 'axe:a'], 3]]);
});

test('getRuleMatches excludes a match supported by fewer pages than the minimum', () => {
  assert.deepEqual(getRuleSets(getAgreeingPages(2)), []);
  assert.deepEqual(getRuleSets(getAgreeingPages(2), 2), [[['alfa:b', 'axe:a'], 2]]);
});

test('getRuleMatches excludes two rules violated by different elements on a page on which both were tested', () => {
  const data = [...getAgreeingPages(3), getPage('d', {axe: {a: violated(['0'])}, alfa: {b: violated(['0', '1'])}})];
  assert.deepEqual(getRuleSets(data), []);
});

test('getRuleMatches excludes two rules only one of which was violated on a page on which both were tested', () => {
  const data = [...getAgreeingPages(3), getPage('d', {axe: {a: violated(['0'])}})];
  assert.deepEqual(getRuleSets(data), []);
});

test('getRuleMatches ignores pages on which either rule was not tested', () => {
  const data = [
    ...getAgreeingPages(3),
    // The engine of one rule was prevented.
    getPage('p', {axe: {a: violated(['0'])}}, {preventions: {alfa: 'page timed out'}}),
    // The engine of one rule did not try to test.
    getPage('n', {axe: {a: violated(['0'])}}, {ruleEngineIDs: ['axe']})
  ];
  assert.deepEqual(getRuleSets(data), [[['alfa:b', 'axe:a'], 3]]);
});

test('getRuleMatches ignores pages on which the test of either rule was individually prevented', () => {
  const data = Array.from({length: 3}, (_, index) => getPage(
    `t${index}`,
    {axe: {a: violated(['0'])}, testaro: {c: violated(['0'])}},
    // The test of another rule of the same engine was prevented.
    {rulePreventions: {testaro: ['other']}}
  ));
  data.push(getPage('r', {axe: {a: violated(['0'])}}, {rulePreventions: {testaro: ['c']}}));
  assert.deepEqual(getRuleSets(data), [[['axe:a', 'testaro:c'], 3]]);
});

test('getRuleMatches treats a page as no evidence if both rules were violated there by any unknown element', () => {
  const data = [
    ...getAgreeingPages(3),
    getPage('u', {axe: {a: violated(['0'], 1)}, alfa: {b: violated(['1'])}}),
    getPage('v', {axe: {a: violated(['0'])}, alfa: {b: violated([], 2)}})
  ];
  assert.deepEqual(getRuleSets(data), [[['alfa:b', 'axe:a'], 3]]);
});

test('getRuleMatches ignores cantTell instances and rules without violations on a page', () => {
  const data = getAgreeingPages(3);
  (data[0]!.violations as any).nuVal = {
    c: {
      failed: {violators: new Set(), count: 0, unlocatedCount: 0},
      cantTell: {violators: new Set(['0']), count: 1, unlocatedCount: 0}
    }
  };
  assert.deepEqual(getRuleSets(data), [[['alfa:b', 'axe:a'], 3]]);
});

test('getRuleMatches lists a set of three rules every two of which match as one set', () => {
  const data = Array.from({length: 4}, (_, index) => getPage(`m${index}`, {
    axe: {a: violated(['0'])}, alfa: {b: violated(['0'])}, nuVal: {c: violated(['0'])}
  }));
  // The rules of one pair are supported by fewer pages, because one of them was not tested on one page.
  data[3]!.extract.preventions = {nuVal: 'HTTP 502'};
  delete (data[3]!.violations as any).nuVal;
  assert.deepEqual(getRuleSets(data), [[['alfa:b', 'axe:a', 'nuVal:c'], 3]]);
});

test('getRuleMatches lists overlapping sets when matching is not transitive', () => {
  const data = Array.from({length: 3}, (_, index) => getPage(`o${index}`, {
    axe: {a: violated(['0'])}, alfa: {b: violated(['0'])}, nuVal: {c: violated(['0'])}
  }));
  // On a page on which alfa was prevented, the axe and nuVal rules were violated by different elements.
  data.push(getPage('x', {axe: {a: violated(['0'])}, nuVal: {c: violated(['1'])}}, {preventions: {alfa: 'Error'}}));
  assert.deepEqual(getRuleSets(data), [[['alfa:b', 'axe:a'], 3], [['alfa:b', 'nuVal:c'], 3]]);
});

test('getRuleMatches sorts sets by decreasing size, then decreasing support, then first rule', () => {
  const data = Array.from({length: 4}, (_, index) => getPage(`s${index}`, {
    // A set of 3 rules supported by 3 pages.
    axe: {x: violated(['0']), y: violated(['0']), z: violated(['0'])},
    // Sets of 2 rules supported by 4 pages and by 3 pages.
    alfa: {p: violated(['1']), q: violated(['1']), r: violated(['2']), s: violated(['2'])},
    nuVal: {m: violated(['3']), n: violated(['3'])}
  }));
  delete (data[3]!.violations as any).axe;
  delete (data[3]!.violations as any).alfa.r;
  delete (data[3]!.violations as any).alfa.s;
  assert.deepEqual(getRuleSets(data), [
    [['axe:x', 'axe:y', 'axe:z'], 3],
    [['alfa:p', 'alfa:q'], 4],
    [['nuVal:m', 'nuVal:n'], 4],
    [['alfa:r', 'alfa:s'], 3]
  ]);
});

// TESTS OF THE PAGE

// Returns the texts of the items of the list under a heading.
const getSetTexts = (html: ReturnType<typeof parse>, heading: string): string[] => {
  const h2 = html.querySelectorAll('h2').find(element => element.text === heading)!;
  return h2.nextElementSibling!.querySelectorAll(':scope > li').map(item => item.text.replace(/\s+/g, ' ').trim());
};

test('listRuleMatches lists sets of matching rules by kind, with their rules and support', async () => {
  violationDataResult = Array.from({length: 3}, (_, index) => getPage(`h${index}`, {
    alfa: {mockAlfaRule: violated(['0'])},
    axe: {mockRule: violated(['0']), mockOtherRule: violated(['0']), mockThirdRule: violated(['5'])},
    nuVal: {'Mock message about .+\\.': violated(['5'])}
  }));
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.match(html.querySelector('main p')!.text, /Sets found: 2, based on the last test of each of 3 pages\.$/);
  assert.deepEqual(getSetTexts(html, 'Rules of different rule engines'), [
    'Axe rule mockThirdRule: Third mock rule (issue: mock issue C) Html Checker API rule Mock message about .+\\.: Mock message (issue: mock issue B) Each two of these rules were violated by the same elements on at least 3 pages on which both were tested.'
  ]);
  assert.deepEqual(getSetTexts(html, 'Rules of the same and different rule engines'), [
    'Alfa rule mockAlfaRule: Mock Alfa rule (issue: mock issue A) Axe rule mockOtherRule: Other mock rule (issue: mock issue B) Axe rule mockRule: Mock rule (issue: mock issue A) Each two of these rules were violated by the same elements on at least 3 pages on which both were tested.'
  ]);
  const sameHeading = html.querySelectorAll('h2').find(element => element.text === 'Rules of the same rule engine')!;
  assert.equal(sameHeading.nextElementSibling!.text, 'No such sets.');
  assert.ok(result.answerPage.includes('<a href="/listRules.html/mockIssueC">mock issue C</a>'));
});

test('listRuleMatches lists a set of rules of the same rule engine', async () => {
  violationDataResult = Array.from({length: 3}, (_, index) => getPage(`e${index}`, {
    axe: {mockRule: violated(['0']), mockIgnorableRule: violated(['0'])}
  }));
  const result: any = await answer();
  const html = parse(result.answerPage);
  assert.equal(getSetTexts(html, 'Rules of the same rule engine').length, 1);
  assert.equal(
    html.querySelectorAll('p').filter(element => element.text === 'No such sets.').length, 2
  );
});

test('listRuleMatches uses a valid minimum number of supporting pages from the path tail', async () => {
  violationDataResult = Array.from({length: 2}, (_, index) => getPage(`q${index}`, {
    axe: {mockRule: violated(['0']), mockIgnorableRule: violated(['0'])}
  }));
  // With the default minimum, 2 pages are too few.
  let html = parse((await answer() as any).answerPage);
  assert.match(html.querySelector('main p')!.text, /at least 3 such pages\..*Sets found: 0,/);
  assert.equal(html.querySelector('input[name="minPages"]')!.getAttribute('value'), '3');
  // With a minimum of 2, they suffice.
  html = parse((await answer('2') as any).answerPage);
  assert.match(html.querySelector('main p')!.text, /at least 2 such pages\..*Sets found: 1,/);
  assert.equal(html.querySelector('input[name="minPages"]')!.getAttribute('value'), '2');
  assert.equal(html.querySelector('input[name="minPages"]')!.getAttribute('pattern'), '[2-9]|[1-9][0-9]');
  assert.equal(html.querySelector('form')!.getAttribute('method'), 'get');
  assert.equal(html.querySelector('.error'), null);
});

test('listRuleMatches uses the default minimum and says so when the requested minimum is invalid', async () => {
  for (const value of ['1', '0', 'abc', '2.5', '10000']) {
    const html = parse((await answer(value) as any).answerPage);
    assert.match(html.querySelector('main p')!.text, /at least 3 such pages\./, value);
    assert.equal(
      html.querySelector('.error')!.text,
      'The minimum number of supporting pages must be a whole number from 2 to 99, so the default, 3, was used.',
      value
    );
  }
});

test('listRuleMatches says that there are no sets when there are no reports', async () => {
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.match(html.querySelector('main p')!.text, /Sets found: 0, based on the last test of each of 0 pages\.$/);
  assert.equal(html.querySelectorAll('p').filter(element => element.text === 'No such sets.').length, 3);
});

test('listRuleMatches states that the data are unavailable when reports need reannotation', async () => {
  violationDataResult = {error: realUtil.reannotationNeededMessage};
  const result: any = await answer();
  assert.equal(result.status, 'ok');
  const html = parse(result.answerPage);
  assert.equal(html.querySelector('main p')!.text, `${realUtil.reannotationNeededMessage}.`);
  assert.equal(html.querySelectorAll('h2').length, 0);
  assert.equal(html.querySelector('form'), null);
});

test('listRuleMatches returns an error when the violation data cannot be compiled', async () => {
  violationDataResult = {error: 'Report is invalid (test override)'};
  assert.deepEqual(await answer(), {status: 'error', message: 'Report is invalid (test override)'});
});
