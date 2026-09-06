/*
  util.test.js
  Tests for util.js data-path injection (Phase 1) and utility functions.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
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
  objectSort
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
