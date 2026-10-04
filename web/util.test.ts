/*
  util.test.ts
  Tests of the utility functions used only by the web pages.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {reportsPath} from '../util.ts';
import {
  checkCommentLength,
  getAgoString,
  getCountString,
  getEngineNamesString,
  getMultiReportWhats,
  getPageData,
  getPageDataStrings,
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

test('getPageData returns page data for a valid report', async () => {
  const data = await getPageData('260101T0000', 'mix') as any;
  assert.equal(data.description, 'Mixed Outcomes Page');
  assert.equal(data.url, 'https://example.com/mixed');
  assert.equal(typeof data.daysAgo, 'number');
});

test('getPageData returns an error for a nonexistent report', async () => {
  const data = await getPageData('999999T9999', 'xxx') as any;
  assert.ok(data.error);
});

test('getPageDataStrings returns HTML strings for a valid report', async () => {
  const strings = await getPageDataStrings('260101T0000', 'mix') as any;
  assert.equal(strings.description, 'Mixed Outcomes Page');
  assert.equal(strings.url, 'https://example.com/mixed');
  assert.equal(strings.urlLink, '<a href="https://example.com/mixed">https://example.com/mixed</a>');
  assert.ok(strings.testInfo.includes('by job <code>260101T0000-mix</code>'));
  assert.ok(strings.testInfo.includes('2026-01-01 at 00:00'));
});

test('getPageDataStrings returns different testInfo for a different timeStamp', async () => {
  const strings = await getPageDataStrings('260101T0001', 'ct') as any;
  assert.equal(strings.description, 'All CantTell Page');
  assert.ok(strings.testInfo.includes('by job <code>260101T0001-ct</code>'));
  assert.ok(strings.testInfo.includes('2026-01-01 at 00:01'));
});

test('getPageDataStrings returns an error for a nonexistent report', async () => {
  const strings = await getPageDataStrings('999999T9999', 'xxx');
  assert.ok(strings.error);
});

test('getPageDataStrings uses provided pageData instead of reading the report', async () => {
  const strings = await getPageDataStrings('260101T0000', 'mix', {
    description: 'Custom Page',
    url: 'https://custom.com',
    daysAgo: 1
  }) as any;
  assert.equal(strings.description, 'Custom Page');
  assert.equal(strings.url, 'https://custom.com');
  assert.ok(strings.testInfo.includes('1 day ago'));
});

test('getReportData returns an error for a nonexistent report', async () => {
  const {getReportData} = await import('./util.ts');
  const result: any = await getReportData('990101T0000', 'xxx');
  assert.ok(result.error);
});

test('getReportData falls back to the engine ID for an unknown prevented engine', async () => {
  const {getReportData} = await import('./util.ts');
  const prvJSON = await fs.readFile(path.join(reportsPath(), '260101T0006-prv.json'), 'utf8');
  const report = JSON.parse(prvJSON);
  report.jobData.preventions.unknownEngine = 'mystery failure';
  const reportPath = path.join(reportsPath(), '260103T0000-unk.json');
  await fs.writeFile(reportPath, JSON.stringify(report));
  try {
    const result: any = await getReportData('260103T0000', 'unk');
    assert.ok(result.preventedEngineNames.includes('unknownEngine'));
  }
  finally {
    await fs.unlink(reportPath);
  }
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
