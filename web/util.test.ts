/*
  util.test.ts
  Tests of the utility functions used only by the web pages.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {getReport, isReportError, reportsPath} from '../util.ts';
import {
  checkCommentLength,
  getAgoString,
  getCountString,
  getEngineIDs,
  getEngineNamesString,
  getMultiReportWhats,
  getPageData,
  getPageDataStrings,
  getPageFactsLines,
  getTextFragmentHref,
  getWCAGLink,
  getWeightName,
  makeBreakable
} from './util.ts';

// SETUP AND TEARDOWN

// These tests use the fixture database directory.
import {fixtureDBDir as fixtureDbDir} from '../test/dbFixture.ts';
const savedDbDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = fixtureDbDir;
});

after(() => {
  if (savedDbDir !== undefined) {
    process.env.DB_DIR = savedDbDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('checkCommentLength accepts a comment of exactly 20 characters', () => {
  const result = checkCommentLength('a'.repeat(20));
  assert.deepEqual(result, {status: 'ok'});
});

test('checkCommentLength accepts a comment of exactly 1000 characters', () => {
  const result = checkCommentLength('a'.repeat(1000));
  assert.deepEqual(result, {status: 'ok'});
});

test('checkCommentLength rejects a comment shorter than 20 characters', () => {
  const result = checkCommentLength('a'.repeat(19));
  assert.deepEqual(result, {
    status: 'error',
    message: 'Your comment was shorter than 20 characters'
  });
});

test('checkCommentLength rejects a comment longer than 1000 characters', () => {
  const result = checkCommentLength('a'.repeat(1001));
  assert.deepEqual(result, {
    status: 'error',
    message: 'Your comment was longer than 1000 characters'
  });
});

test('getAgoString returns "1 day" for a 1-day-old timestamp', () => {
  const date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  assert.equal(
    getAgoString(date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11)), '1 day'
  );
});

test('getAgoString returns "3 days" for a 3-day-old timestamp', () => {
  const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  assert.equal(
    getAgoString(date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11)), '3 days'
  );
});

test('getCountString returns singular for count 1', () => {
  assert.equal(getCountString(1, 'report', 'reports'), '1 report');
});

test('getCountString returns plural for count 0', () => {
  assert.equal(getCountString(0, 'report', 'reports'), '0 reports');
});

test('getTextFragmentHref returns a text-fragment URL', () => {
  const href = getTextFragmentHref('Hello', 'https://example.com/page');
  assert.ok(href.startsWith('https://example.com/page#:~:text='));
});

test('getWCAGLink returns a URL for a numeric WCAG ID', () => {
  const link = getWCAGLink('4.1.2');
  assert.ok(link.startsWith('https://www.w3.org/WAI/WCAG22/Understanding/'));
});

test('getWeightName returns the correct name for each weight', () => {
  assert.equal(getWeightName(1), 'lowest');
  assert.equal(getWeightName(2), 'low');
  assert.equal(getWeightName(3), 'high');
  assert.equal(getWeightName(4), 'highest');
  assert.equal(getWeightName(5), 'unknown');
});

test('makeBreakable inserts wbr before non-initial slashes', () => {
  assert.equal(makeBreakable('/api/listReports'), '/api<wbr>/listReports');
});

// Returns a fixture report, failing the test if it is not usable.
const getFixtureReport = async (timeStamp: string, jobID: string) => {
  const report = await getReport(timeStamp, jobID);
  if (isReportError(report)) {
    assert.fail(report.error);
  }
  return report;
};

test('getPageData returns page data for a valid report', async () => {
  const data = getPageData(await getFixtureReport('260101T0000', 'mix'));
  assert.equal(data.description, 'Mixed Outcomes Page');
  assert.equal(data.url, 'https://example.com/mixed');
  assert.equal(typeof data.daysAgo, 'number');
});

test('getReport returns an error for a nonexistent report', async () => {
  const report = await getReport('999999T9999', 'xxx');
  assert.ok(isReportError(report));
});

test('getPageDataStrings returns HTML strings for a valid report', async () => {
  const strings = getPageDataStrings(await getFixtureReport('260101T0000', 'mix'));
  assert.equal(strings.description, 'Mixed Outcomes Page');
  assert.equal(strings.url, 'https://example.com/mixed');
  assert.equal(strings.urlLink, '<a href="https://example.com/mixed">https://example.com/mixed</a>');
  assert.ok(strings.testInfo.includes('by job <code>260101T0000-mix</code>'));
  assert.ok(strings.testInfo.includes('2026-01-01 at 00:00'));
});

test('getPageDataStrings returns different testInfo for a different timeStamp', async () => {
  const strings = getPageDataStrings(await getFixtureReport('260101T0001', 'ct'));
  assert.equal(strings.description, 'All CantTell Page');
  assert.ok(strings.testInfo.includes('by job <code>260101T0001-ct</code>'));
  assert.ok(strings.testInfo.includes('2026-01-01 at 00:01'));
});

test('getPageDataStrings derives the strings from the report object', async () => {
  const report = await getFixtureReport('260101T0000', 'mix');
  report.target.what = 'Custom Page';
  const strings = getPageDataStrings(report);
  assert.equal(strings.description, 'Custom Page');
});

test('getPageDataStrings reports a 1-day-old report as tested 1 day ago', () => {
  // Construct an end time 1 day and 1 hour ago, so Math.round gives exactly 1.
  const date = new Date(Date.now() - (86400000 + 3600000));
  const endTime = date.toISOString().slice(2, 16);
  const report = {
    id: '260101T0000-mix',
    target: {what: 'Some Page', url: 'https://example.com'},
    jobData: {endTime}
  } as any;
  const strings = getPageDataStrings(report);
  assert.ok(strings.testInfo.includes('1 day ago'));
});

test('getReportData returns data for a valid report', async () => {
  const {getReportData} = await import('./util.ts');
  const result = getReportData(await getFixtureReport('260101T0000', 'mix'));
  assert.equal(result.url, 'https://example.com/mixed');
  assert.equal(result.jobName, '260101T0000-mix');
});

test('getReportData falls back to the engine ID for an unknown prevented engine', async () => {
  const {getReportData} = await import('./util.ts');
  const prvJSON = await fs.readFile(path.join(reportsPath(), '260101T0006-prv.json'), 'utf8');
  const reportJSON = JSON.parse(prvJSON);
  reportJSON.jobData.preventions.unknownEngine = 'mystery failure';
  const reportPath = path.join(reportsPath(), '260103T0000-unk.json');
  await fs.writeFile(reportPath, JSON.stringify(reportJSON));
  try {
    const result = getReportData(await getFixtureReport('260103T0000', 'unk'));
    assert.ok(result.preventedEngineNames.includes('unknownEngine'));
  }
  finally {
    await fs.unlink(reportPath);
  }
});

test('getPageFactsLines returns the about-page list lines for a report', async () => {
  const {getReportData} = await import('./util.ts');
  const report = await getFixtureReport('260101T0000', 'mix');
  const lines = getPageFactsLines(getPageDataStrings(report), getReportData(report), '  ');
  const html = lines.join('\n');
  assert.ok(html.includes('<li>URL: <a href="https://example.com/mixed">'));
  assert.ok(html.includes('<li>Summary of results:'));
  assert.ok(html.includes('<li>Called: 2</li>'));
  assert.ok(html.includes('<li>Violations: 3</li>'));
  assert.ok(html.includes('<li>Issues: 2</li>'));
});

test('getIssueFactsLines returns the about-issue list lines for a report', async () => {
  const {getIssueFactsLines} = await import('./util.ts');
  const report = await getFixtureReport('260101T0000', 'mix');
  const lines = getIssueFactsLines(report, 'linkNoText', '  ');
  const html = lines.join('\n');
  assert.ok(html.includes('<li>Why it matters:'));
  assert.ok(html.includes('<li>Priority:'));
  assert.ok(html.includes('<li>Related WCAG standard: <a href='));
  assert.ok(html.includes('<li>Reported by'));
  assert.ok(html.includes('<li>Violations:'));
  assert.ok(html.includes('<li>Violators:'));
});

test('getViolatorFactsLines returns the about-violator list lines for a report', async () => {
  const {getViolatorFactsLines} = await import('./util.ts');
  const report = await getFixtureReport('260101T0000', 'mix');
  const lines = getViolatorFactsLines(report, 'linkNoText', '0', null, '  ');
  const html = lines.join('\n');
  assert.ok(html.includes('<li>Tag name: <code>'));
  assert.ok(html.includes('<li>Text:'));
  assert.ok(html.includes('<li>Start tag: <code>'));
  assert.ok(html.includes('<li>XPath: <code>'));
  assert.ok(html.includes('<li>Bounding box:'));
  assert.ok(html.includes('<li>Reported by'));
});

test('getAgoString returns "1 day" for exactly 1 day ago', () => {
  // Construct a time stamp 1 day and 1 hour ago, so Math.round gives exactly 1.
  const date = new Date(Date.now() - (86400000 + 3600000));
  const stamp = date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11);
  assert.equal(getAgoString(stamp), '1 day');
});

test('getDateTimeString describes an invalid time stamp as unknown', async () => {
  const {getDateTimeString} = await import('./util.ts');
  const result = getDateTimeString('999999T9999');
  assert.equal(result, 'an unknown date at an unknown time');
});

test('getEngineNamesString falls back to the engine ID for an unknown engine', async () => {
  const {getEngineNamesString} = await import('./util.ts');
  const result = getEngineNamesString(new Set(['unknownEngine']));
  assert.equal(result, 'unknownEngine');
});

test('getPathID returns the catalog pathID when catalogIndex is truthy', async () => {
  const {getPathID} = await import('./util.ts');
  const catalog = {'0': {tagName: 'div', pathID: '/html/body/div'}};
  assert.equal(getPathID(catalog, '0', '/fallback'), '/html/body/div');
});

test('getPathID returns the fallback pathID when catalogIndex is truthy but catalogItem has no pathID', async () => {
  const {getPathID} = await import('./util.ts');
  const catalog = {'0': {tagName: 'div', pathID: ''}};
  assert.equal(getPathID(catalog, '0', '/fallback'), '/fallback');
});

test('getPathID returns /html when catalogIndex is truthy but catalogItem and pathID are both missing', async () => {
  const {getPathID} = await import('./util.ts');
  const catalog = {};
  assert.equal(getPathID(catalog, '0', null as any), '/html');
});

test('getPathID returns /html when catalogIndex is falsy and pathID is null', async () => {
  const {getPathID} = await import('./util.ts');
  assert.equal(getPathID({}, null as any, null as any), '/html');
});

test('getEngineNamesString returns a sorted +-delimited list of engine names', () => {
  const result = getEngineNamesString(new Set(['axe', 'wave', 'nuVal']));
  const names = result.split(' + ');
  assert.ok(names.length === 3);
  assert.ok(names.includes('WAVE'));
});

test('getEngineNamesString falls back to the ID for an unknown engine', () => {
  assert.equal(getEngineNamesString(new Set(['unknownEngine'])), 'unknownEngine');
});

test('getMultiReportWhats returns descriptions that have multiple reports', async () => {
  const whats = await getMultiReportWhats();
  assert.ok(whats.includes('Mixed Outcomes Page'));
});

test('getMultiReportWhats uses extracts provided by the caller', async () => {
  const extract = {timeStamp: 't', jobID: 'j', url: 'https://example.com/', reportTime: ''};
  const whats = await getMultiReportWhats([
    {...extract, description: 'B'},
    {...extract, description: 'A'},
    {...extract, description: 'B'}
  ]);
  assert.deepEqual(whats, ['B']);
});

// Returns a minimal report for testing rule-engine identification.
const makeEngineReport = (whiches: string[], preventions: Record<string, string>) => ({
  acts: whiches.map(which => ({type: 'test', which})),
  jobData: {preventions}
});

test('getEngineIDs counts a prevented engine, which has an act, once', () => {
  const ids = getEngineIDs(makeEngineReport(['axe', 'wave'], {wave: 'failed'}));
  assert.deepEqual(ids.calledIDs.sort(), ['axe', 'wave']);
  assert.deepEqual(ids.preventedIDs, ['wave']);
});

test('getEngineIDs counts a prevented engine that has no act', () => {
  const ids = getEngineIDs(makeEngineReport(['axe'], {alfa: 'failed'}));
  assert.deepEqual(ids.calledIDs.sort(), ['alfa', 'axe']);
  assert.deepEqual(ids.preventedIDs, ['alfa']);
});

test('getEngineIDs counts nuVal and nuVnu as one engine when nuVal succeeds', () => {
  const ids = getEngineIDs(makeEngineReport(['nuVal', 'nuVnu'], {}));
  assert.deepEqual(ids.calledIDs, ['nuVal']);
  assert.deepEqual(ids.preventedIDs, []);
});

test('getEngineIDs ignores a nuVal prevention when nuVnu succeeds', () => {
  const ids = getEngineIDs(makeEngineReport(['nuVal', 'nuVnu'], {nuVal: 'failed'}));
  assert.deepEqual(ids.calledIDs, ['nuVal']);
  assert.deepEqual(ids.preventedIDs, []);
});

test('getEngineIDs counts one prevention when both nuVal and nuVnu are prevented', () => {
  const ids = getEngineIDs(makeEngineReport(['nuVal', 'nuVnu'], {nuVal: 'failed', nuVnu: 'failed'}));
  assert.deepEqual(ids.calledIDs, ['nuVal']);
  assert.deepEqual(ids.preventedIDs, ['nuVal']);
});

test('getEngineIDs counts a nuVal prevention when nuVnu was not called', () => {
  const ids = getEngineIDs(makeEngineReport(['nuVal'], {nuVal: 'failed'}));
  assert.deepEqual(ids.calledIDs, ['nuVal']);
  assert.deepEqual(ids.preventedIDs, ['nuVal']);
});
