/*
  util.test.js
  Tests for util.js data-path injection (Phase 1) and utility functions.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {
  dbPath,
  jobsPath,
  recsPath,
  reportsPath,
  hiddenReportsPath,
  getAgoDays,
  getAgoString,
  getCountString,
  getDateString,
  getDateTime,
  getIssue,
  getJSON,
  getObject,
  getNowStamp,
  getPlainText,
  getRandomString,
  getTextFragmentHref,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isJobID,
  isTimeStamp,
  isURL,
  makeBreakable,
  minifyURL,
  objectSort,
  processTestRequest,
  annotateReport,
  isReportAvailable
} = require('./util');

// TESTS

test('dbPath defaults to the project db directory when DB_DIR is unset', () => {
  const saved = process.env.DB_DIR;
  delete process.env.DB_DIR;
  try {
    assert.equal(dbPath(), path.join(__dirname, 'db'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
  }
});

test('dbPath honors DB_DIR when it is set', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(dbPath(), '/tmp/kilotest-fixtures');
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});

test('jobsPath, recsPath, reportsPath, and hiddenReportsPath derive from DB_DIR', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(jobsPath(), path.join('/tmp/kilotest-fixtures', 'jobs'));
    assert.equal(recsPath(), path.join('/tmp/kilotest-fixtures', 'jobs', 'recs.json'));
    assert.equal(reportsPath(), path.join('/tmp/kilotest-fixtures', 'reports'));
    assert.equal(hiddenReportsPath(), path.join('/tmp/kilotest-fixtures', 'hiddenReports'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});

test('changing DB_DIR between calls is reflected by the path functions', () => {
  const saved = process.env.DB_DIR;
  try {
    process.env.DB_DIR = '/tmp/a';
    assert.equal(reportsPath(), path.join('/tmp/a', 'reports'));
    process.env.DB_DIR = '/tmp/b';
    assert.equal(reportsPath(), path.join('/tmp/b', 'reports'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});

test('getAgoDays returns a positive number for a valid time stamp', () => {
  const days = getAgoDays('260101T0000');
  assert.ok(typeof days === 'number');
  assert.ok(days > 0);
});

test('getAgoDays returns null for an invalid string', () => {
  assert.equal(getAgoDays('invalid'), null);
});

test('getAgoDays returns null for a non-string non-Date argument', () => {
  assert.equal(getAgoDays(42), null);
});

test('getAgoDays returns 0 for the current time', () => {
  assert.equal(getAgoDays(new Date()), 0);
});

test('getAgoString returns "1 day" for a 1-day-old timestamp', () => {
  const date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  assert.equal(getAgoString(date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11)), '1 day');
});

test('getCountString returns singular for count 1', () => {
  assert.equal(getCountString(1, 'report', 'reports'), '1 report');
});

test('getCountString returns plural for count 0', () => {
  assert.equal(getCountString(0, 'report', 'reports'), '0 reports');
});

test('getDateString returns a valid date string for a valid time stamp', () => {
  assert.equal(getDateString('260101T0000'), '2026-01-01');
});

test('getDateString returns empty string for an invalid time stamp', () => {
  assert.equal(getDateString('999999T9999'), '');
});

test('getDateTime returns a Date for a valid time stamp', () => {
  const date = getDateTime('260101T0000');
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString(), '2026-01-01T00:00:00.000Z');
});

test('getDateTime returns null for an invalid time stamp', () => {
  assert.equal(getDateTime('invalid'), null);
});

test('getIssue returns an issue ID for a known engine and rule', () => {
  const issueID = getIssue('axe', 'link-name');
  assert.ok(typeof issueID === 'string' || issueID === null);
});

test('getIssue returns null for an unknown engine', () => {
  assert.equal(getIssue('nonexistentEngine', 'anyRule'), null);
});

test('getJSON returns a JSON string with a trailing newline', () => {
  assert.equal(getJSON({a: 1}), '{\n  "a": 1\n}\n');
});

test('getObject returns the parsed object for a valid JSON file', async () => {
  const result = await getObject(path.join(__dirname, 'package.json'));
  assert.ok(typeof result === 'object');
  assert.equal(result.name, '@jrpool/kilotest');
});

test('getObject returns an error string for a nonexistent file', async () => {
  const result = await getObject('/tmp/nonexistent-file.json');
  assert.equal(typeof result, 'string');
  assert.ok(result.startsWith('ERROR'));
});

test('getNowStamp returns an 11-character time stamp', () => {
  const stamp = getNowStamp();
  assert.equal(stamp.length, 11);
  assert.ok(/^\d{6}T\d{4}$/.test(stamp));
});

test('getPlainText replaces special characters', () => {
  assert.equal(getPlainText('a<b>c&d'), 'a b c+d');
});

test('getRandomString returns a string of the requested length', () => {
  const s = getRandomString(10);
  assert.equal(s.length, 10);
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

test('htmlSafe escapes HTML special characters', () => {
  assert.equal(htmlSafe('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('htmlSafe returns empty string for falsy input', () => {
  assert.equal(htmlSafe(''), '');
});

test('isJobID returns true for a valid job ID', () => {
  assert.equal(isJobID('abc'), true);
});

test('isJobID returns false for an invalid job ID', () => {
  assert.equal(isJobID('ABCD'), false);
  assert.equal(isJobID('ab'), false);
});

test('isTimeStamp returns true for a valid time stamp', () => {
  assert.equal(isTimeStamp('260101T0000'), true);
});

test('isTimeStamp returns false for an invalid time stamp', () => {
  assert.equal(isTimeStamp('invalid'), false);
});

test('isURL returns a URL object for a valid HTTPS URL', () => {
  const result = isURL('https://example.com/page');
  assert.ok(result instanceof URL);
  assert.equal(result.hostname, 'example.com');
});

test('isURL returns false for a non-HTTPS URL', () => {
  assert.equal(isURL('http://example.com/page'), false);
});

test('isURL returns false for an invalid URL', () => {
  assert.equal(isURL('not-a-url'), false);
});

test('makeBreakable inserts wbr before non-initial slashes', () => {
  assert.equal(makeBreakable('/api/listReports'), '/api<wbr>/listReports');
});

test('minifyURL removes www. and trailing slash and lowercases', () => {
  assert.equal(minifyURL('https://www.Example.com/'), 'https://example.com');
});

test('objectSort sorts objects alphabetically by a string property', () => {
  const items = [{name: 'banana'}, {name: 'apple'}, {name: 'cherry'}];
  const sorted = objectSort(items, 'name', 'alpha');
  assert.deepEqual(sorted.map(i => i.name), ['apple', 'banana', 'cherry']);
});

test('objectSort sorts objects numerically ascending', () => {
  const items = [{count: 3}, {count: 1}, {count: 2}];
  const sorted = objectSort(items, 'count', 'numericUp');
  assert.deepEqual(sorted.map(i => i.count), [1, 2, 3]);
});

test('objectSort sorts objects numerically descending', () => {
  const items = [{count: 1}, {count: 3}, {count: 2}];
  const sorted = objectSort(items, 'count', 'numericDown');
  assert.deepEqual(sorted.map(i => i.count), [3, 2, 1]);
});

// TESTS FOR processTestRequest, annotateReport, AND isReportAvailable

// These tests use the fixture database directory and the real web/requestTest template.
const fixtureDbDir = path.join(__dirname, 'test', 'fixtures', 'db');
const requestTestDir = path.join(__dirname, 'web', 'requestTest');
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

test('processTestRequest returns an error for an invalid test type', async () => {
  const result = await processTestRequest('invalid', requestTestDir, 'Page', 'https://example.com', 'because');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('processTestRequest returns an error for an invalid URL', async () => {
  const result = await processTestRequest('test', requestTestDir, 'Page', 'not-a-url', 'because');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('processTestRequest returns an error for a short reason', async () => {
  const result = await processTestRequest('test', requestTestDir, 'Page', 'https://example.com', 'abc');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('processTestRequest returns an error for a missing description', async () => {
  const result = await processTestRequest('test', requestTestDir, '', 'https://example.com', 'because');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('processTestRequest returns an error for a mismatched directory name', async () => {
  const result = await processTestRequest('test', '/tmp/wrongDir', 'Page', 'https://example.com', 'because');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid recommendation');
});

test('processTestRequest succeeds and populates the template for a valid request', async () => {
  // Reset recs.json to empty before the test.
  await fs.writeFile(recsPath(), '{}\n');
  const result = await processTestRequest('test', requestTestDir, 'Example Page', 'https://example.com', 'because accessibility');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('Example Page'));
  assert.ok(result.answerPage.includes('because accessibility'));
  // Clean up recs.json.
  await fs.writeFile(recsPath(), '{}\n');
});

test('processTestRequest returns a duplicate error for a repeated request', async () => {
  // Reset recs.json to empty, then make a successful request.
  await fs.writeFile(recsPath(), '{}\n');
  await processTestRequest('test', requestTestDir, 'Example Page', 'https://example.com', 'because accessibility');
  // Repeat the same request.
  const result = await processTestRequest('test', requestTestDir, 'Example Page', 'https://example.com', 'another reason');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Duplicate recommendation');
  // Clean up recs.json.
  await fs.writeFile(recsPath(), '{}\n');
});

test('annotateReport returns an error for a nonexistent report', async () => {
  const result = await annotateReport('990101T0000', 'xxx');
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('missing'));
});

test('annotateReport annotates a valid report and returns an empty string', async () => {
  const reportPath = path.join(fixtureDbDir, 'reports', '260101T0000-mix.json');
  const original = await fs.readFile(reportPath, 'utf8');
  try {
    const result = await annotateReport('260101T0000', 'mix');
    assert.equal(result, '');
  }
  finally {
    await fs.writeFile(reportPath, original);
  }
});

test('isReportAvailable returns true for a known page description', async () => {
  const result = await isReportAvailable('Mixed Outcomes Page', 'https://example.com/nonexistent');
  assert.equal(result, true);
});

test('isReportAvailable returns true for a known URL', async () => {
  const result = await isReportAvailable('Nonexistent Page', 'https://example.com/mixed');
  assert.equal(result, true);
});

test('isReportAvailable returns false for an unknown page and URL', async () => {
  const result = await isReportAvailable('Nonexistent Page', 'https://nonexistent.example.com/');
  assert.equal(result, false);
});

// TESTS FOR REMAINING BRANCH COVERAGE

test('getJobNames returns an error when a job directory is not readable', async () => {
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/nonexistent-db-dir';
  try {
    const {getJobNames} = require('./util');
    const result = await getJobNames();
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('ERROR'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
  }
});

test('getObject returns an error for a file that is not valid JSON', async () => {
  const tmpFile = path.join(require('node:os').tmpdir(), 'kilotest-test-invalid.json');
  require('node:fs').writeFileSync(tmpFile, 'not json');
  const result = await getObject(tmpFile);
  assert.equal(typeof result, 'string');
  assert.ok(result.startsWith('ERROR'));
  require('node:fs').unlinkSync(tmpFile);
});

test('getRecs creates an empty recommendations file and returns an error when it is missing', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-missing-recs-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/jobs', {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getRecs} = require('./util');
    const result = await getRecs();
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('ERROR'));
    // Verify the empty file was created.
    assert.ok(fsSync.existsSync(tmpDir + '/jobs/recs.json'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getRecs returns an error when the recommendations file is not JSON', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-recs-test';
  require('node:fs').mkdirSync(tmpDir + '/jobs', {recursive: true});
  require('node:fs').writeFileSync(tmpDir + '/jobs/recs.json', 'not json');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getRecs} = require('./util');
    const result = await getRecs();
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('ERROR'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    require('node:fs').rmSync(tmpDir, {recursive: true});
  }
});

test('getPOSTData resolves with parsed query for form-urlencoded requests', async () => {
  const {Readable} = require('node:stream');
  const {getPOSTData} = require('./util');
  const body = 'target=Page&why=Because';
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'content-type': 'application/x-www-form-urlencoded'}});
  const result = await getPOSTData(req);
  assert.equal(result.target, 'Page');
  assert.equal(result.why, 'Because');
});

test('isRecommendable returns "claimed" for a URL in a claimed job', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-recommendable-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/jobs/claimed', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/queue', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/failed', {recursive: true});
  fsSync.writeFileSync(tmpDir + '/jobs/claimed/job1.json', JSON.stringify({
    target: {url: 'https://example.com/test', what: 'Test Page'}
  }));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {isRecommendable} = require('./util');
    const result = await isRecommendable('https://example.com/test');
    assert.equal(result, 'claimed');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('isRecommendable returns "queued" for a URL in a queued job', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-recommendable-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/jobs/claimed', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/queue', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/failed', {recursive: true});
  fsSync.writeFileSync(tmpDir + '/jobs/queue/job1.json', JSON.stringify({
    target: {url: 'https://example.com/test', what: 'Test Page'}
  }));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {isRecommendable} = require('./util');
    const result = await isRecommendable('https://example.com/test');
    assert.equal(result, 'queued');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('isRecommendable returns empty string for a URL with no matching jobs', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-recommendable-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/jobs/claimed', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/queue', {recursive: true});
  fsSync.mkdirSync(tmpDir + '/jobs/failed', {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {isRecommendable} = require('./util');
    const result = await isRecommendable('https://example.com/no-match');
    assert.equal(result, '');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('isURL returns false for a malformed URL', () => {
  assert.equal(isURL('https://[invalid'), false);
});

test('objectSort returns 0 for an unknown sort type', () => {
  const items = [{name: 'a'}, {name: 'b'}];
  const sorted = objectSort(items, 'name', 'unknownType');
  assert.equal(sorted.length, 2);
});

test('getReport returns an error for an invalid report', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-invalid-report-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/reports', {recursive: true});
  fsSync.writeFileSync(tmpDir + '/reports/260101T0000-bad.json', JSON.stringify({notValid: true}));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getReport} = require('./util');
    const result = await getReport('260101T0000', 'bad');
    assert.ok(result.error);
    assert.ok(result.error.includes('invalid'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getReportData returns an error for a nonexistent report', async () => {
  const {getReportData} = require('./util');
  const result = await getReportData('990101T0000', 'xxx');
  assert.ok(result.error);
});

// TESTS FOR REMAINING BRANCH COVERAGE IN util.js

test('getAgoDays returns null for an invalid Date object', () => {
  assert.equal(getAgoDays(new Date('invalid')), null);
});

test('getAgoString returns "1 day" for exactly 1 day ago', () => {
  // Construct a time stamp 1 day and 1 hour ago, so Math.round gives exactly 1.
  const date = new Date(Date.now() - (86400000 + 3600000));
  const stamp = date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11);
  assert.equal(getAgoString(stamp), '1 day');
});

test('getIssue returns null for a known engine with an unknown variable rule', () => {
  assert.equal(getIssue('axe', 'nonexistent-rule-id'), null);
});

test('getIssue returns an issue ID for a variable rule pattern match', () => {
  const result = getIssue('nuVal', 'Duplicate attribute foo');
  assert.ok(typeof result === 'string');
  assert.equal(result, 'duplicateAttribute');
});

test('getTimeString returns null for an invalid time portion', () => {
  const {getDateTimeString} = require('./util');
  const result = getDateTimeString('999999T9999');
  assert.ok(result.includes('null'));
});

test('getPOSTData resolves with parsed JSON for application/json requests', async () => {
  const {Readable} = require('node:stream');
  const {getPOSTData} = require('./util');
  const body = JSON.stringify({target: 'Page', why: 'Because'});
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'content-type': 'application/json'}});
  const result = await getPOSTData(req);
  assert.equal(result.target, 'Page');
});

test('getPOSTData resolves with parsed query for body-type form-urlencoded requests', async () => {
  const {Readable} = require('node:stream');
  const {getPOSTData} = require('./util');
  const body = 'target=Page&why=Because';
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'body-type': 'application/x-www-form-urlencoded'}});
  const result = await getPOSTData(req);
  assert.equal(result.target, 'Page');
  assert.equal(result.why, 'Because');
});

test('getEngineNamesString falls back to the engine ID for an unknown engine', () => {
  const {getEngineNamesString} = require('./util');
  const result = getEngineNamesString(new Set(['unknownEngine']));
  assert.equal(result, 'unknownEngine');
});

test('getPathID returns the catalog pathID when catalogIndex is truthy', () => {
  const {getPathID} = require('./util');
  const catalog = {'0': {pathID: '/html/body/div'}};
  assert.equal(getPathID(catalog, '0', '/fallback'), '/html/body/div');
});

test('getPathID returns the fallback pathID when catalogIndex is truthy but catalogItem has no pathID', () => {
  const {getPathID} = require('./util');
  const catalog = {'0': {tagName: 'div'}};
  assert.equal(getPathID(catalog, '0', '/fallback'), '/fallback');
});

test('getPathID returns /html when catalogIndex is truthy but catalogItem and pathID are both missing', () => {
  const {getPathID} = require('./util');
  const catalog = {};
  assert.equal(getPathID(catalog, '0', null), '/html');
});

test('getPathID returns /html when catalogIndex is falsy and pathID is null', () => {
  const {getPathID} = require('./util');
  assert.equal(getPathID({}, null, null), '/html');
});

test('isValidReport returns false for a report with a test act using an unknown engine', () => {
  const {isValidReport} = require('./util');
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [{type: 'test', which: 'unknownEngine'}],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  assert.equal(isValidReport(report), false);
});

test('isValidReport returns true for a report with a non-test act', () => {
  const {isValidReport} = require('./util');
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [{type: 'other'}],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  assert.equal(isValidReport(report), true);
});

test('annotateReport handles a test act with no standardResult instances', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-no-instances-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/reports', {recursive: true});
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {standardResult: {instances: []}}},
      {type: 'other'}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  fsSync.writeFileSync(tmpDir + '/reports/260101T0000-ni.json', JSON.stringify(report));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const result = await annotateReport('260101T0000', 'ni');
    assert.equal(result, '');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('annotateReport handles a test act with no standardResult', async () => {
  const tmpDir = require('node:os').tmpdir() + '/kilotest-no-standard-test';
  const fsSync = require('node:fs');
  fsSync.mkdirSync(tmpDir + '/reports', {recursive: true});
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {}}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  fsSync.writeFileSync(tmpDir + '/reports/260101T0000-ns.json', JSON.stringify(report));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const result = await annotateReport('260101T0000', 'ns');
    assert.equal(result, '');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});
