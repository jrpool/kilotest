/*
  util.test.ts
  Tests for util.ts data-path injection (Phase 1) and utility functions.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';

// Blank the alert configuration unconditionally, before util.ts (which processTestRequest
// calls sendAlert from) is ever imported below, so this file sends no real alert emails
// even when run directly (e.g. `npx tsx --test util.test.ts`) rather than via `npm test`,
// which normally guards against this via test/setup.ts.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

import {
  annotateReportObject,
  awaitJob,
  checkCommentDuplicate,
  checkLength,
  quarantineReport,
  createLock,
  dbPath,
  describeMax,
  getAgoDays,
  getDateString,
  getDateTime,
  getEnvMax,
  getIssue,
  errorMessage,
  getJobsData,
  getJSON,
  getNowStamp,
  getObject,
  getPlainText,
  getRandomString,
  getReportEndTime,
  getReportExtract,
  getPageReportExtracts,
  getReportExtracts,
  getReportPageID,
  getReportPath,
  getReportStats,
  getTimeStamp,
  hiddenReportsPath,
  htmlSafe,
  getAllowedRedirectURL,
  isAllowedRedirectTarget,
  isAllowedReport,
  isAllowedTarget,
  isJobID,
  isTimeStamp,
  isURL,
  isValidAuthCode,
  jobsPath,
  minifyURL,
  objectSort,
  testRequestsPath,
  reportsPath,
  unusableReportsPath
} from './util.ts';

// TESTS

test('checkLength accepts text at the minimum bound', () => {
  const result = checkLength('a'.repeat(5), 5, 10, 'reason');
  assert.deepEqual(result, {status: 'ok'});
});

test('checkLength accepts text at the maximum bound', () => {
  const result = checkLength('a'.repeat(10), 5, 10, 'reason');
  assert.deepEqual(result, {status: 'ok'});
});

test('checkLength rejects text shorter than the minimum bound', () => {
  const result = checkLength('a'.repeat(4), 5, 10, 'reason');
  assert.deepEqual(result, {
    status: 'error',
    message: 'The reason must be between 5 and 10 characters long'
  });
});

test('checkLength rejects text longer than the maximum bound', () => {
  const result = checkLength('a'.repeat(11), 5, 10, 'reason');
  assert.deepEqual(result, {
    status: 'error',
    message: 'The reason must be between 5 and 10 characters long'
  });
});

test('checkCommentDuplicate accepts a comment with no existing comments', () => {
  const result = checkCommentDuplicate([], 'a'.repeat(20));
  assert.deepEqual(result, {status: 'ok'});
});

test('checkCommentDuplicate rejects a comment identical to one already stored, regardless of when', () => {
  const content = 'a'.repeat(20);
  const comments = [{content}];
  const result = checkCommentDuplicate(comments, content);
  assert.deepEqual(result, {
    status: 'error',
    message: 'Your comment is identical to one already submitted, but you are welcome to submit a different comment'
  });
});

test('checkCommentDuplicate accepts a comment that differs from a stored one', () => {
  const comments = [{content: 'a'.repeat(20)}];
  const result = checkCommentDuplicate(comments, 'b'.repeat(20));
  assert.deepEqual(result, {status: 'ok'});
});

test('dbPath defaults to the project db directory when DB_DIR is unset', () => {
  const saved = process.env.DB_DIR;
  delete process.env.DB_DIR;
  try {
    assert.equal(dbPath(), path.join(import.meta.dirname, 'db'));
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

test('jobsPath, testRequestsPath, reportsPath, hiddenReportsPath, and unusableReportsPath derive from DB_DIR', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(jobsPath(), path.join('/tmp/kilotest-fixtures', 'jobs'));
    assert.equal(testRequestsPath(), path.join('/tmp/kilotest-fixtures', 'jobs', 'testRequests.json'));
    assert.equal(reportsPath(), path.join('/tmp/kilotest-fixtures', 'reports'));
    assert.equal(hiddenReportsPath(), path.join('/tmp/kilotest-fixtures', 'hiddenReports'));
    assert.equal(unusableReportsPath(), path.join('/tmp/kilotest-fixtures', 'unusableReports'));
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
  assert.equal(getAgoDays(42 as any), null);
});

test('getAgoDays returns 0 for the current time', () => {
  assert.equal(getAgoDays(new Date()), 0);
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

test('getEnvMax returns the default when the variable is unset', () => {
  delete process.env.TEST_ENV_MAX_VAR;
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 20);
});

test('getEnvMax returns the default when the variable is empty', () => {
  process.env.TEST_ENV_MAX_VAR = '';
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 20);
  delete process.env.TEST_ENV_MAX_VAR;
});

test('getEnvMax returns the configured value when it is a positive integer', () => {
  process.env.TEST_ENV_MAX_VAR = '50';
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 50);
  delete process.env.TEST_ENV_MAX_VAR;
});

test('getEnvMax returns the default when the variable is not an integer', () => {
  process.env.TEST_ENV_MAX_VAR = 'not-a-number';
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 20);
  delete process.env.TEST_ENV_MAX_VAR;
});

test('getEnvMax returns 0 when the variable is explicitly 0, meaning no limit', () => {
  process.env.TEST_ENV_MAX_VAR = '0';
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 0);
  delete process.env.TEST_ENV_MAX_VAR;
});

test('getEnvMax returns the default when the variable is negative', () => {
  process.env.TEST_ENV_MAX_VAR = '-5';
  assert.equal(getEnvMax('TEST_ENV_MAX_VAR', 20), 20);
  delete process.env.TEST_ENV_MAX_VAR;
});

test('describeMax returns "no limit" for a cap of 0 and the number otherwise', () => {
  assert.equal(describeMax(0), 'no limit');
  assert.equal(describeMax(20), '20');
});

test('getIssue returns an issue ID for a known engine and rule', () => {
  const issueID = getIssue('axe', 'link-name');
  assert.ok(typeof issueID === 'string' || issueID === null);
});

test('getIssue returns null for an unknown engine', () => {
  assert.equal(getIssue('nonexistentEngine', 'anyRule'), null);
});

test('errorMessage returns the message of an Error instance', () => {
  assert.equal(errorMessage(new Error('something went wrong')), 'something went wrong');
});

test('errorMessage returns the string representation of a non-Error value', () => {
  assert.equal(errorMessage('bare string'), 'bare string');
});

test('getJSON returns a JSON string with a trailing newline', () => {
  assert.equal(getJSON({a: 1}), '{\n  "a": 1\n}\n');
});

test('getObject returns the parsed object for a valid JSON file', async () => {
  const result = await getObject(path.join(import.meta.dirname, 'package.json'));
  assert.ok(typeof result === 'object' && result !== null);
  assert.equal((result as {name: unknown}).name, '@jrpool/kilotest');
});

test('getObject throws for a nonexistent file', async () => {
  await assert.rejects(getObject('/tmp/nonexistent-file.json'), /not readable/);
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

test('isURL returns true for a valid HTTPS URL', () => {
  assert.equal(isURL('https://example.com/page'), true);
});

test('isURL returns false for a non-HTTPS URL', () => {
  assert.equal(isURL('http://example.com/page'), false);
});

test('isURL returns false for an invalid URL', () => {
  assert.equal(isURL('not-a-url'), false);
});

// A fake resolver, so isAllowedTarget tests need no real DNS/network access.
const fakeLookup = (address: string) => async () => [{address, family: net.isIP(address)}];

// isAllowedTarget and isAllowedReport branch on ALLOW_INTERNAL_TARGETS, which other test
// files (sharing this process) set to "true" for their own unrelated tests, so every test
// below sets the env var itself, rather than relying on it being unset by default, and
// restores whatever value preceded it.
let savedAllowInternalTargets: string | undefined;

before(() => {
  savedAllowInternalTargets = process.env.ALLOW_INTERNAL_TARGETS;
});

after(() => {
  if (savedAllowInternalTargets === undefined) {
    delete process.env.ALLOW_INTERNAL_TARGETS;
  }
  else {
    process.env.ALLOW_INTERNAL_TARGETS = savedAllowInternalTargets;
  }
});

test('isAllowedTarget returns true for a URL resolving to a public address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('93.184.216.34')), true);
});

test('isAllowedTarget returns false for a URL resolving to a loopback address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('127.0.0.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a private address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('10.0.0.5')), false);
});

test('isAllowedTarget returns false for a URL resolving to a 172.16/12 private address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('172.20.0.5')), false);
});

test('isAllowedTarget returns false for a URL resolving to a carrier-grade NAT address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('100.70.0.5')), false);
});

test('isAllowedTarget returns false for a URL resolving to a link-local/cloud-metadata address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('169.254.169.254')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv6 loopback address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv6 unspecified address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('::')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv4-mapped private IPv6 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('::ffff:10.0.0.5')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv6 unique-local address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('fd12:3456:789a:1::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv6 link-local address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('fe80::1')), false);
});

test('isAllowedTarget returns true for a URL resolving to a public IPv6 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('2606:2800:220:1:248:1893:25c8:1946')), true);
});

test('isAllowedTarget returns false for a URL resolving to a TEST-NET-1 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('192.0.2.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a TEST-NET-2 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('198.51.100.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a TEST-NET-3 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('203.0.113.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a benchmarking (198.18/15) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('198.18.0.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a reserved 240/4 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('240.0.0.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to the broadcast address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('255.255.255.255')), false);
});

test('isAllowedTarget returns false for a URL resolving to a multicast address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('224.0.0.1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a deprecated IPv6 site-local address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('fec0::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to an IPv6 multicast address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('ff02::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a 6to4 (2002::/16) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('2002::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to a Teredo (2001::/32) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('2001::1')), false);
});

test('isAllowedTarget returns false for a URL resolving to an NAT64 (64:ff9b::/96) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', fakeLookup('64:ff9b::10.0.0.5')), false);
});

test('isAllowedTarget returns false for a URL resolving to an address family net.isIP does not recognize', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://example.com/page', async () => [{address: 'not-an-ip', family: 0}]), false);
});

test('isAllowedTarget returns false when the DNS lookup rejects', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  const lookup = async () => { throw new Error('lookup failed'); };
  assert.equal(await isAllowedTarget('https://nonexistent.invalid/page', lookup), false);
});

test('isAllowedTarget returns false for a URL whose literal host is a private IP', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://192.168.1.1/page'), false);
});

test('isAllowedTarget returns true for a URL whose literal host is a public IP', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('https://93.184.216.34/page'), true);
});

test('isAllowedTarget returns false for a syntactically invalid URL', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(await isAllowedTarget('not-a-url'), false);
});

test('isAllowedTarget returns true for a private-address target when ALLOW_INTERNAL_TARGETS is true', async () => {
  process.env.ALLOW_INTERNAL_TARGETS = 'true';
  assert.equal(await isAllowedTarget('https://192.168.1.1/page'), true);
});

// A fake fetch that returns a response whose url reflects any redirect,
// so isAllowedRedirectTarget tests need no real network access.
const fakeFetch = (finalURL: string) => async () => ({url: finalURL}) as Response;

test('isAllowedRedirectTarget returns true when the final URL resolves to a public address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://example.com/page'), fakeLookup('93.184.216.34')),
    true
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a private address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://10.0.0.5/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('getAllowedRedirectURL returns the final URL of an allowed target, or null for a disallowed one', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await getAllowedRedirectURL('https://example.com/a', fakeFetch('https://example.com/b'), fakeLookup('93.184.216.34')),
    'https://example.com/b'
  );
  assert.equal(
    await getAllowedRedirectURL('https://example.com/a', fakeFetch('https://10.0.0.5/b'), fakeLookup('93.184.216.34')),
    null
  );
});
test('isAllowedRedirectTarget returns false when the fetch throws', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  const fetchImpl = async () => { throw new Error('fetch failed'); };
  assert.equal(await isAllowedRedirectTarget('https://example.com/page', fetchImpl), false);
});

test('isAllowedRedirectTarget returns true for any URL when ALLOW_INTERNAL_TARGETS is true, without fetching', async () => {
  process.env.ALLOW_INTERNAL_TARGETS = 'true';
  const fetchImpl = async () => { throw new Error('fetch should not be called'); };
  assert.equal(await isAllowedRedirectTarget('https://192.168.1.1/page', fetchImpl), true);
});

test('isAllowedRedirectTarget returns false when a redirect leads to a TEST-NET-1 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://192.0.2.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a TEST-NET-2 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://198.51.100.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a TEST-NET-3 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://203.0.113.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a benchmarking (198.18/15) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://198.18.0.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a reserved 240/4 address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://240.0.0.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to the broadcast address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://255.255.255.255/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a multicast address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://224.0.0.1/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a deprecated IPv6 site-local address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://[fec0::1]/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a 6to4 (2002::/16) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://[2002::1]/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedRedirectTarget returns false when a redirect leads to a Teredo (2001::/32) address', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  assert.equal(
    await isAllowedRedirectTarget('https://example.com/page', fakeFetch('https://[2001::1]/page'), fakeLookup('93.184.216.34')),
    false
  );
});

test('isAllowedReport returns true when every act has a public actualURL', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  const report = {
    target: {what: 'Example', url: 'https://example.com/page'},
    acts: [
      {type: 'test', actualURL: 'https://example.com/page'},
      {type: 'test', actualURL: 'https://example.com/page2'}
    ]
  };
  assert.equal(await isAllowedReport(report, fakeLookup('93.184.216.34')), true);
});

test('isAllowedReport returns false when any act has a disallowed actualURL', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  const report = {
    target: {what: 'Example', url: 'https://example.com/page'},
    acts: [
      {type: 'test', actualURL: 'https://example.com/page'},
      {type: 'test', actualURL: 'https://internal.example.net/page'}
    ]
  };
  let callCount = 0;
  const lookup = async (hostname: string) => {
    callCount++;
    return hostname === 'internal.example.net'
      ? [{address: '10.0.0.5', family: 4}]
      : [{address: '93.184.216.34', family: 4}];
  };
  assert.equal(await isAllowedReport(report, lookup), false);
  assert.ok(callCount > 0);
});

test('isAllowedReport falls back to the report target URL when an act has no actualURL', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  const report = {
    target: {what: 'Example', url: 'https://example.com/page'},
    acts: [{type: 'test'}]
  };
  assert.equal(await isAllowedReport(report, fakeLookup('93.184.216.34')), true);
});

test('isValidAuthCode returns true when the code matches AUTH_CODE', () => {
  const saved = process.env.AUTH_CODE;
  process.env.AUTH_CODE = 'secret-code';
  try {
    assert.equal(isValidAuthCode('secret-code'), true);
  }
  finally {
    if (saved === undefined) {
      delete process.env.AUTH_CODE;
    }
    else {
      process.env.AUTH_CODE = saved;
    }
  }
});

test('isValidAuthCode returns false when the code does not match AUTH_CODE', () => {
  const saved = process.env.AUTH_CODE;
  process.env.AUTH_CODE = 'secret-code';
  try {
    assert.equal(isValidAuthCode('wrong-code'), false);
  }
  finally {
    if (saved === undefined) {
      delete process.env.AUTH_CODE;
    }
    else {
      process.env.AUTH_CODE = saved;
    }
  }
});

test('isValidAuthCode returns false for an undefined code', () => {
  assert.equal(isValidAuthCode(undefined), false);
});

test('minifyURL removes www. and trailing slash and lowercases', () => {
  assert.equal(minifyURL('https://www.Example.com/'), 'https://example.com');
  // The www. label is removed whatever its case, but only where it begins the host.
  assert.equal(minifyURL('https://WWW.Example.com/Path/'), 'https://example.com/path');
  assert.equal(minifyURL('https://example.com/docs/www.pdf'), 'https://example.com/docs/www.pdf');
  assert.equal(minifyURL('https://awww.example.com'), 'https://awww.example.com');
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

// TESTS USING THE FIXTURE DATABASE

// These tests use the fixture database directory.
import {fixtureDBDir as fixtureDbDir} from './test/dbFixture.ts';
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

test('annotateReportObject annotates a report object in place without reading or writing a file', async () => {
  // A report object that was never written to disk (e.g. one just received from a worker,
  // as in index.ts's worker/report handler, which annotates before the first write).
  const report: any = {
    id: '990101T0099-obj',
    target: {what: 'Object Page', url: 'https://example.com/object'},
    acts: [
      {
        type: 'test',
        which: 'alfa',
        result: {
          standardResult: {
            instances: [
              // A classifiable rule.
              {ruleID: 'r11', what: 'The link does not have an accessible name', outcome: 'failed', catalogIndex: '0'},
              // An unclassifiable rule.
              {ruleID: 'unknownRule123', what: 'Unknown', outcome: 'failed', catalogIndex: '0'}
            ]
          }
        }
      }
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  const instances = report.acts[0].result.standardResult.instances;
  assert.equal(instances[0].issueID, 'linkNoText');
  assert.equal(instances[1].issueID, undefined);
  assert.deepEqual(report.jobData.issuelessRules, ['alfa:unknownRule123']);
});

test('annotateReportObject handles a test act with no standardResult instances', async () => {
  const report: any = {
    id: '990101T0098-ni',
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {standardResult: {instances: []}}},
      {type: 'other'}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  assert.deepEqual(report.jobData.issuelessRules, []);
});

test('annotateReportObject handles a test act with no standardResult', async () => {
  const report: any = {
    id: '990101T0097-ns',
    target: {what: 'Test', url: 'https://example.com'},
    acts: [
      {type: 'test', which: 'axe', result: {}}
    ],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  await annotateReportObject(report);
  assert.deepEqual(report.jobData.issuelessRules, []);
});

// TESTS FOR REMAINING BRANCH COVERAGE

test('getJobNames creates missing job directories and returns empty arrays', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-jobnames-'));
  const tmpDbDir = path.join(tmpRoot, 'db');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDbDir;
  try {
    const {getJobNames} = await import('./util.ts');
    const result = await getJobNames();
    assert.ok(typeof result === 'object' && result !== null);
    const jobNames = result as Record<string, string[]>;
    assert.deepEqual(jobNames.queue, []);
    assert.deepEqual(jobNames.claimed, []);
    assert.deepEqual(jobNames.failed, []);
    // Verify the directories were created.
    for (const category of ['queue', 'claimed', 'failed']) {
      const stat = await fs.stat(path.join(tmpDbDir, 'jobs', category));
      assert.ok(stat.isDirectory());
    }
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
});

test('getJobNames throws when a job directory is a file, not a directory', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-jobnames-err-'));
  const tmpJobsDir = path.join(tmpRoot, 'db', 'jobs');
  await fs.mkdir(tmpJobsDir, {recursive: true});
  // Create a file where the queue directory should be, causing ENOTDIR.
  await fs.writeFile(path.join(tmpJobsDir, 'queue'), 'not a directory');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    const {getJobNames} = await import('./util.ts');
    await assert.rejects(getJobNames(), /not readable/);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
});

test('getJobsData returns an empty array, instead of throwing ENOENT, when its category directory does not yet exist', async () => {
  // Regression test: on a fresh deployment, jobs/claimed and jobs/queue may never
  // have been created yet (no job has ever been claimed or queued there). getJobsData
  // must tolerate that the same way getJobNames does, rather than reading the
  // category directory directly and throwing ENOENT.
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-jobsdata-'));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    const {getJobsData} = await import('./util.ts');
    const result = await getJobsData('claimed');
    assert.deepEqual(result, []);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
});

test('getJobsData skips a job file that is removed between the directory listing and its read', async (t) => {
  // Regression test: on the deployed server, a worker can complete or reclaim a
  // claimed job (moving or deleting its file) between getJobsData listing the
  // claimed directory and reading a specific file it found there. That race must
  // result in the vanished job simply being skipped, not an uncaught ENOENT.
  const claimedPath = path.join(jobsPath(), 'claimed', 'raced.json');
  await fs.writeFile(claimedPath, getJSON({
    target: {what: 'Raced Page', url: 'https://example.com/raced'}
  }));
  const originalReadFile = fs.readFile;
  t.mock.method(fs, 'readFile', async (filePath: any, ...rest: any[]) => {
    // Simulate the file having been removed by a worker just before this read.
    if (String(filePath) === claimedPath) {
      await fs.unlink(claimedPath);
      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      throw error;
    }
    return (originalReadFile as any)(filePath, ...rest);
  });
  try {
    const {getJobsData} = await import('./util.ts');
    const result = await getJobsData('claimed');
    assert.ok(!result.some(job => job.url === 'https://example.com/raced'));
  }
  finally {
    t.mock.reset();
    await fs.unlink(claimedPath).catch(() => {});
  }
});

test('getJobsData returns the page identifier of a job, or an empty one for a job without one', async () => {
  const withPath = path.join(jobsPath(), 'queue', 'withPage.json');
  const withoutPath = path.join(jobsPath(), 'queue', 'withoutPage.json');
  await fs.writeFile(withPath, getJSON({sources: {pageID: 'p-withpage'}, target: {url: 'https://example.com/with'}}));
  await fs.writeFile(withoutPath, getJSON({target: {url: 'https://example.com/without'}}));
  try {
    const result = await getJobsData('queue');
    assert.ok(result.some(job => job.pageID === 'p-withpage' && job.url === 'https://example.com/with'));
    assert.ok(result.some(job => job.pageID === '' && job.url === 'https://example.com/without'));
  }
  finally {
    await fs.unlink(withPath);
    await fs.unlink(withoutPath);
  }
});

test('getJobsData throws when a job file cannot be read for a reason other than its removal', async () => {
  // A directory where a job file is expected causes fs.readFile to fail with
  // EISDIR, not ENOENT, so getJobsData must still treat it as defective (unlike
  // the ENOENT case above, which is skipped as a normal race with a worker).
  const claimedDirAsFile = path.join(jobsPath(), 'claimed', 'notAFile.json');
  await fs.mkdir(claimedDirAsFile);
  try {
    const {getJobsData} = await import('./util.ts');
    await assert.rejects(getJobsData('claimed'), /defective/);
  }
  finally {
    await fs.rm(claimedDirAsFile, {recursive: true}).catch(() => {});
  }
});

test('getObject throws for a file that is not valid JSON', async () => {
  const tmpFile = path.join((await import('node:os')).tmpdir(), 'kilotest-test-invalid.json');
  (await import('node:fs')).writeFileSync(tmpFile, 'not json');
  try {
    await assert.rejects(getObject(tmpFile), /not JSON/);
  }
  finally {
    (await import('node:fs')).unlinkSync(tmpFile);
  }
});

test('getPOSTData resolves with parsed query for form-urlencoded requests', async () => {
  const {Readable} = await import('node:stream');
  const {getPOSTData} = await import('./util.ts');
  const body = 'target=Page&why=Because';
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'content-type': 'application/x-www-form-urlencoded'}});
  const result: any = await getPOSTData(req as any);
  assert.equal(result.target, 'Page');
  assert.equal(result.why, 'Because');
});

test('isURL returns false for a malformed URL', () => {
  assert.equal(isURL('https://[invalid'), false);
});

test('objectSort returns 0 for an unknown sort type', () => {
  const items = [{name: 'a'}, {name: 'b'}];
  const sorted = objectSort(items, 'name', 'unknownType' as any);
  assert.equal(sorted.length, 2);
});

test('getReport returns an error for an invalid report', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-invalid-report-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir + '/reports', {recursive: true});
  fsSync.writeFileSync(tmpDir + '/reports/260101T0000-bad.json', JSON.stringify({notValid: true}));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getReport} = await import('./util.ts');
    const result = await getReport('260101T0000-bad') as any;
    assert.ok(result.error);
    assert.ok(result.error.includes('not usable'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

// TESTS FOR REMAINING BRANCH COVERAGE IN util.js

test('getAgoDays returns null for an invalid Date object', () => {
  assert.equal(getAgoDays(new Date('invalid')), null);
});

test('getIssue returns null for a known engine with an unknown variable rule', () => {
  assert.equal(getIssue('axe', 'nonexistent-rule-id'), null);
});

test('getIssue returns an issue ID for a variable rule pattern match', () => {
  const result = getIssue('nuVal', 'Duplicate attribute foo.');
  assert.ok(typeof result === 'string');
  assert.equal(result, 'duplicateAttribute');
});

test('getPOSTData resolves with parsed JSON for application/json requests', async () => {
  const {Readable} = await import('node:stream');
  const {getPOSTData} = await import('./util.ts');
  const body = JSON.stringify({target: 'Page', why: 'Because'});
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'content-type': 'application/json'}});
  const result: any = await getPOSTData(req as any);
  assert.equal(result.target, 'Page');
});

test('getPOSTData resolves with parsed query for body-type form-urlencoded requests', async () => {
  const {Readable} = await import('node:stream');
  const {getPOSTData} = await import('./util.ts');
  const body = 'target=Page&why=Because';
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  }), {headers: {'body-type': 'application/x-www-form-urlencoded'}});
  const result: any = await getPOSTData(req as any);
  assert.equal(result.target, 'Page');
  assert.equal(result.why, 'Because');
});

test('getPOSTData resolves with null for an unknown content type', async () => {
  const {Readable} = await import('node:stream');
  const {getPOSTData} = await import('./util.ts');
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from('data'));
      this.push(null);
    }
  }), {headers: {}});
  const result: any = await getPOSTData(req as any);
  assert.equal(result, null);
});

test('getPOSTData resolves with null for a malformed JSON body', async () => {
  const {Readable} = await import('node:stream');
  const {getPOSTData} = await import('./util.ts');
  const req = Object.assign(new Readable({
    read() {
      this.push(Buffer.from('{not valid json'));
      this.push(null);
    }
  }), {headers: {'content-type': 'application/json'}});
  const result: any = await getPOSTData(req as any);
  assert.equal(result, null);
});

test('isUsableReport returns false for a report with a test act using an unknown engine', async () => {
  const {isUsableReport} = await import('./util.ts');
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [{type: 'test', which: 'unknownEngine'}],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  assert.equal(isUsableReport(report), false);
});

test('isUsableReport returns true for a report with a non-test act', async () => {
  const {isUsableReport} = await import('./util.ts');
  const report = {
    target: {what: 'Test', url: 'https://example.com'},
    acts: [{type: 'other'}],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  assert.equal(isUsableReport(report), true);
});

// UNIT TESTS FOR PREVIOUSLY UNTESTED EXPORTED FUNCTIONS

test('createLock returns a function that runs tasks sequentially', async () => {
  const lock = createLock();
  const order: string[] = [];
  const p1 = lock(async () => {
    order.push('start 1');
    await new Promise(r => setTimeout(r, 10));
    order.push('end 1');
    return 1;
  });
  const p2 = lock(async () => {
    order.push('start 2');
    return 2;
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, 1);
  assert.equal(r2, 2);
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2']);
});

test('createLock propagates errors without blocking subsequent tasks', async () => {
  const lock = createLock();
  const p1 = lock(async () => {
    throw new Error('first failed');
  });
  const p2 = lock(async () => 'second succeeded');
  await p1.catch(() => {});
  const r2 = await p2;
  assert.equal(r2, 'second succeeded');
});

test('getTimeStamp returns an 11-character stamp from a Date', () => {
  const date = new Date('2026-03-15T14:30:00.000Z');
  const stamp = getTimeStamp(date);
  assert.equal(stamp.length, 11);
  assert.equal(stamp.slice(0, 6), '260315');
  assert.equal(stamp.slice(6, 7), 'T');
  assert.equal(stamp.slice(7), '1430');
});

test('getReportPath returns the path of a report file', () => {
  const result = getReportPath('260101T0000-mix');
  assert.ok(result.endsWith('260101T0000-mix.json'));
});

test('getReportEndTime returns the completion time of a report', () => {
  const endTime = getReportEndTime({jobData: {endTime: '26-03-04T05:06'}});
  assert.equal(endTime.toISOString(), '2026-03-04T05:06:00.000Z');
});

test('getReportEndTime returns an invalid date for a report with no completion time', () => {
  assert.ok(isNaN(getReportEndTime({}).getTime()));
});

test('getReportStats returns reportSize for a valid report', async () => {
  const stats = await getReportStats('260101T0000-mix');
  assert.ok(stats);
  assert.equal(typeof stats.reportSize, 'number');
  assert.ok(stats.reportSize > 0);
});

test('getReportStats returns null for a nonexistent report', async () => {
  const stats = await getReportStats('999999T9999-xxx');
  assert.equal(stats, null);
});


test('getReportExtract returns an extract for a valid report', async () => {
  const extract = await getReportExtract('260101T0000-mix') as any;
  assert.equal(extract.id, '260101T0000-mix');
  assert.equal(extract.description, 'Mixed Outcomes');
  assert.equal(extract.url, 'https://example.com/mixed');
  assert.ok(extract.reportTime);
});

test('getReportExtract returns an error for a nonexistent report', async () => {
  const extract = await getReportExtract('999999T9999-xxx') as any;
  assert.ok(extract.error);
});

test('getReportExtract returns an error for an unusable report', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-extract-bad-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  await fs.mkdir(tmpReportsDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    // A report with a target and a completion time but no usable acts or catalog is
    // defective, so it must produce no extract rather than be exposed in listings.
    await fs.writeFile(
      path.join(tmpReportsDir, '260101T0000-bad.json'),
      JSON.stringify({
        target: {what: 'Defective Page', url: 'https://example.com/defective'},
        jobData: {endTime: '26-01-01T00:00'}
      })
    );
    const extract = await getReportExtract('260101T0000-bad') as any;
    assert.ok(extract.error);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('quarantineReport ignores a missing report', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-quarantine-missing-'));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await quarantineReport('999999T9999-xxx', 'not usable');
    // Nothing was created or moved.
    assert.deepEqual(await fs.readdir(tmpRoot), []);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('quarantineReport leaves a recently modified report in place', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-quarantine-young-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  await fs.mkdir(tmpReportsDir, {recursive: true});
  const filePath = path.join(tmpReportsDir, '260101T0000-bad.json');
  await fs.writeFile(filePath, '{}');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await quarantineReport('260101T0000-bad', 'not usable');
    // The fresh file may still be mid-write, so it was not moved.
    await fs.access(filePath);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('quarantineReport quarantines a report old enough to be quarantined', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-quarantine-old-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  await fs.mkdir(tmpReportsDir, {recursive: true});
  const filePath = path.join(tmpReportsDir, '260101T0000-bad.json');
  await fs.writeFile(filePath, '{}');
  // Age the file beyond the quarantine threshold.
  const longAgo = new Date(Date.now() - 120000);
  await fs.utimes(filePath, longAgo, longAgo);
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await quarantineReport('260101T0000-bad', 'not usable');
    // The file was moved to the unusable-reports directory.
    await fs.access(filePath).then(
      () => {throw new Error('Report should have been quarantined');},
      () => {}
    );
    const quarantined = await fs.readdir(path.join(tmpRoot, 'db', 'unusableReports'));
    assert.deepEqual(quarantined, ['260101T0000-bad.json']);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('quarantineReport leaves the file and logs when the move fails', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-quarantine-blocked-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  await fs.mkdir(tmpReportsDir, {recursive: true});
  const filePath = path.join(tmpReportsDir, '260101T0000-bad.json');
  await fs.writeFile(filePath, '{}');
  // Age the file beyond the quarantine threshold.
  const longAgo = new Date(Date.now() - 120000);
  await fs.utimes(filePath, longAgo, longAgo);
  // A directory already occupying the destination path makes the rename fail.
  await fs.mkdir(path.join(tmpRoot, 'db', 'unusableReports', '260101T0000-bad.json'), {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await quarantineReport('260101T0000-bad', 'not usable');
    // The report stays where it was.
    await fs.access(filePath);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('getReport quarantines a malformed report file old enough to be quarantined', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-getreport-bad-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  await fs.mkdir(tmpReportsDir, {recursive: true});
  const filePath = path.join(tmpReportsDir, '260101T0000-bad.json');
  await fs.writeFile(filePath, 'not JSON');
  // Age the file beyond the quarantine threshold.
  const longAgo = new Date(Date.now() - 120000);
  await fs.utimes(filePath, longAgo, longAgo);
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    const {getReport} = await import('./util.ts');
    const result = await getReport('260101T0000-bad') as any;
    assert.ok(result.error);
    // The malformed file was quarantined.
    const quarantined = await fs.readdir(path.join(tmpRoot, 'db', 'unusableReports'));
    assert.deepEqual(quarantined, ['260101T0000-bad.json']);
  }
  finally {
    if (savedDbDir !== undefined) {
      process.env.DB_DIR = savedDbDir;
    }
    else {
      delete process.env.DB_DIR;
    }
    await fs.rm(tmpRoot, {recursive: true, force: true});
  }
});

test('getReportExtracts returns extracts of all available reports', async () => {
  const extracts = await getReportExtracts();
  assert.ok(extracts.length >= 8);
  const ids = extracts.map(e => e.id);
  assert.ok(ids.includes('260101T0000-mix'));
  assert.ok(ids.includes('260101T0001-ct'));
});

test('getReportExtracts with onlyLatest returns only the latest report for each page', async () => {
  const latest = await getReportExtracts(true);
  const mixReports = latest.filter(e => e.description === 'Mixed Outcomes');
  assert.equal(mixReports.length, 1);
  assert.equal(mixReports[0]!.id, '260202T0000-new');
});

test('getReportExtracts reflects reports added, modified, and removed after a previous call', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-extracts-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  const savedDbDir = process.env.DB_DIR;
  const sourcePath = path.join(reportsPath(), '260101T0000-mix.json');
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await fs.mkdir(tmpReportsDir, {recursive: true});
    const report = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const firstPath = path.join(tmpReportsDir, '260101T0000-aaa.json');
    await fs.writeFile(firstPath, JSON.stringify(report));
    let extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Mixed Outcomes']);
    // Modify the report and give it a later modification time, as reannotation would.
    report.target.what = 'Revised Page';
    await fs.writeFile(firstPath, JSON.stringify(report));
    const later = new Date(Date.now() + 60000);
    await fs.utimes(firstPath, later, later);
    extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Revised Page']);
    // Add a report about another page.
    report.target.what = 'Added Page';
    report.sources.pageID = 'p-addedpag';
    const secondPath = path.join(tmpReportsDir, '260101T0001-bbb.json');
    await fs.writeFile(secondPath, JSON.stringify(report));
    extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Added Page', 'Revised Page']);
    // Mutating a returned extract does not affect later results.
    extracts[0]!.superseded = true;
    extracts = await getReportExtracts();
    assert.equal(extracts[0]!.superseded, undefined);
    // Make a cached report unreadable.
    await fs.writeFile(secondPath, 'not JSON');
    extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Revised Page']);
    // Restore it.
    await fs.writeFile(secondPath, JSON.stringify(report));
    extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Added Page', 'Revised Page']);
    // Remove a report, as hiding would.
    await fs.rm(firstPath);
    extracts = await getReportExtracts();
    assert.deepEqual(extracts.map(e => e.description), ['Added Page']);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
});

test('getExclusionCookieValue is deterministic for a given AUTH_CODE', async () => {
  const savedAuthCode = process.env.AUTH_CODE;
  process.env.AUTH_CODE = 'test-auth-code';
  try {
    const {getExclusionCookieValue} = await import('./util.ts');
    const first = getExclusionCookieValue();
    const second = getExclusionCookieValue();
    assert.equal(first, second);
    assert.equal(typeof first, 'string');
    assert.ok(first.length > 0);
  }
  finally {
    process.env.AUTH_CODE = savedAuthCode;
  }
});

test('getExclusionCookieValue changes when AUTH_CODE changes', async () => {
  const savedAuthCode = process.env.AUTH_CODE;
  try {
    const {getExclusionCookieValue} = await import('./util.ts');
    process.env.AUTH_CODE = 'code-one';
    const first = getExclusionCookieValue();
    process.env.AUTH_CODE = 'code-two';
    const second = getExclusionCookieValue();
    assert.notEqual(first, second);
  }
  finally {
    process.env.AUTH_CODE = savedAuthCode;
  }
});

test('getExclusionCookieValue does not throw when AUTH_CODE is unset', async () => {
  const savedAuthCode = process.env.AUTH_CODE;
  delete process.env.AUTH_CODE;
  try {
    const {getExclusionCookieValue} = await import('./util.ts');
    assert.equal(typeof getExclusionCookieValue(), 'string');
  }
  finally {
    process.env.AUTH_CODE = savedAuthCode;
  }
});

test('recordMetric creates the metrics file and records a first occurrence when the file is missing', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-missing-metrics-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('pageViews', 'tutorialWeb.html');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.pageViews['tutorialWeb.html'], 1);
    assert.equal(metrics.mcpToolCalls['tutorialWeb.html'], undefined);
    assert.equal(typeof metrics.since, 'string');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric increments an existing count rather than overwriting it', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-existing-metrics-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('mcpToolCalls', 'listPages');
    await recordMetric('mcpToolCalls', 'listPages');
    await recordMetric('mcpToolCalls', 'getReport');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.mcpToolCalls.listPages, 2);
    assert.equal(metrics.mcpToolCalls.getReport, 1);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric throws when the metrics file is not readable for a reason other than being missing', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-unreadable-test';
  const fsSync = await import('node:fs');
  // Create a directory where the metrics file should be, causing EISDIR rather than ENOENT.
  fsSync.mkdirSync(tmpDir + '/metrics.json', {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric} = await import('./util.ts');
    await assert.rejects(recordMetric('pageViews', 'tutorialWeb.html'), /not readable/);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric throws when the metrics file is not JSON', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-not-json-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  fsSync.writeFileSync(tmpDir + '/metrics.json', 'not json');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric} = await import('./util.ts');
    await assert.rejects(recordMetric('pageViews', 'tutorialWeb.html'), /not JSON/);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric keeps categories independent for the same name', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-categories-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('apiOperations', 'listPages');
    await recordMetric('mcpToolCalls', 'listPages');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.apiOperations.listPages, 1);
    assert.equal(metrics.mcpToolCalls.listPages, 1);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric tracks managerActivity outcomes separately per page', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-manager-activity-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('managerActivity', 'reannotate.html', 'ok');
    await recordMetric('managerActivity', 'reannotate.html', 'error');
    await recordMetric('managerActivity', 'reannotate.html', 'error');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.deepEqual(metrics.managerActivity['reannotate.html'], {ok: 1, error: 2});
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('recordMetric keeps managerActivity independent of pageViews for the same name', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-manager-vs-pageviews-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('pageViews', 'hideReportForm.html');
    await recordMetric('managerActivity', 'hideReportForm.html', 'ok');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.pageViews['hideReportForm.html'], 1);
    assert.deepEqual(metrics.managerActivity['hideReportForm.html'], {ok: 1, error: 0});
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getMetrics backfills categories missing from a metrics.json written before they existed', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-backfill-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  // Simulate a metrics.json written before the managerActivity category was added.
  fsSync.writeFileSync(tmpDir + '/metrics.json', JSON.stringify({
    since: '260101T0000',
    pageViews: {listPages: 1},
    mcpToolCalls: {},
    apiOperations: {}
  }));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    // Recording a managerActivity outcome must not throw despite the file predating that category.
    await recordMetric('managerActivity', 'metrics', 'ok');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.since, '260101T0000');
    assert.equal(metrics.pageViews.listPages, 1);
    assert.deepEqual(metrics.managerActivity.metrics, {ok: 1, error: 0});
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getMetrics backfills every category, and generates a since stamp, from a bare empty file', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-metrics-backfill-empty-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir, {recursive: true});
  // Simulate a metrics.json with none of the known fields (an extreme case of an outdated schema).
  fsSync.writeFileSync(tmpDir + '/metrics.json', '{}');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {recordMetric, metricsPath} = await import('./util.ts');
    await recordMetric('pageViews', 'tutorialWeb');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(typeof metrics.since, 'string');
    assert.ok(metrics.since.length > 0);
    assert.equal(metrics.pageViews.tutorialWeb, 1);
    assert.deepEqual(metrics.mcpToolCalls, {});
    assert.deepEqual(metrics.apiOperations, {});
    assert.deepEqual(metrics.managerActivity, {});
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

// TESTS FOR awaitJob (GitHub issue #111)

test('awaitJob returns "completed" immediately when a report already exists', async () => {
  const outcome = await awaitJob('260101T0000-mix');
  assert.equal(outcome, 'completed');
});

test('awaitJob returns "notFound" for an identifier naming neither a report nor a pending job', async () => {
  const outcome = await awaitJob('999999T9999-xxx');
  assert.equal(outcome, 'notFound');
});

test('awaitJob returns "failed" when the job has moved to the failed directory', async () => {
  const failedPath = path.join(jobsPath(), 'failed', '260101T1111-flj.json');
  await fs.mkdir(path.dirname(failedPath), {recursive: true});
  await fs.writeFile(failedPath, getJSON({target: {what: 'Failed Await Page', url: 'https://example.com/failed-await'}}));
  try {
    const outcome = await awaitJob('260101T1111-flj');
    assert.equal(outcome, 'failed');
  }
  finally {
    await fs.unlink(failedPath);
  }
});

test('awaitJob polls until a queued job completes, then returns "completed"', async () => {
  process.env.AWAIT_JOB_POLL_MS = '20';
  process.env.AWAIT_JOB_TIMEOUT_MS = '2000';
  const jobName = '260101T2222-plj';
  const queuedPath = path.join(jobsPath(), 'queue', `${jobName}.json`);
  const reportPath = path.join(reportsPath(), `${jobName}.json`);
  await fs.writeFile(queuedPath, getJSON({target: {what: 'Polled Page', url: 'https://example.com/polled'}}));
  // Simulate the job completing shortly after the wait begins.
  setTimeout(async () => {
    await fs.unlink(queuedPath).catch(() => {});
    await fs.writeFile(reportPath, getJSON({id: jobName, target: {what: 'Polled Page', url: 'https://example.com/polled'}}));
  }, 50);
  try {
    const outcome = await awaitJob('260101T2222-plj');
    assert.equal(outcome, 'completed');
  }
  finally {
    delete process.env.AWAIT_JOB_POLL_MS;
    delete process.env.AWAIT_JOB_TIMEOUT_MS;
    await fs.unlink(queuedPath).catch(() => {});
    await fs.unlink(reportPath).catch(() => {});
  }
});

test('awaitJob returns "timedOut" when a claimed job neither completes nor fails before the deadline', async () => {
  process.env.AWAIT_JOB_POLL_MS = '10';
  process.env.AWAIT_JOB_TIMEOUT_MS = '50';
  const jobName = '260101T3333-toj';
  const claimedPath = path.join(jobsPath(), 'claimed', `${jobName}.json`);
  await fs.writeFile(claimedPath, getJSON({target: {what: 'Stuck Page', url: 'https://example.com/stuck'}}));
  try {
    const outcome = await awaitJob('260101T3333-toj');
    assert.equal(outcome, 'timedOut');
  }
  finally {
    delete process.env.AWAIT_JOB_POLL_MS;
    delete process.env.AWAIT_JOB_TIMEOUT_MS;
    await fs.unlink(claimedPath);
  }
});

test('getReportPageID returns the page identifier of a report, or an empty string if it has none', () => {
  assert.equal(getReportPageID({sources: {pageID: 'p-mixedout'}}), 'p-mixedout');
  assert.equal(getReportPageID({sources: {pageID: 7}}), '');
  assert.equal(getReportPageID({}), '');
});

test('report extracts group reports by page identifier, not description, and omit unmigrated reports', async () => {
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-pages-'));
  const tmpReportsDir = path.join(tmpRoot, 'db', 'reports');
  const savedDbDir = process.env.DB_DIR;
  const sourcePath = path.join(reportsPath(), '260101T0000-mix.json');
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    await fs.mkdir(tmpReportsDir, {recursive: true});
    const report = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    // Write two reports about one page with different descriptions, the later one with the earlier description.
    report.target.what = 'Zeta Page';
    report.jobData.endTime = '26-01-01T00:10';
    await fs.writeFile(path.join(tmpReportsDir, '260101T0000-aaa.json'), JSON.stringify(report));
    report.target.what = 'Alpha Page';
    report.jobData.endTime = '26-02-01T00:10';
    await fs.writeFile(path.join(tmpReportsDir, '260201T0000-bbb.json'), JSON.stringify(report));
    // Write a report without a page identifier.
    delete report.sources.pageID;
    await fs.writeFile(path.join(tmpReportsDir, '260301T0000-ccc.json'), JSON.stringify(report));
    const extracts = await getReportExtracts();
    assert.deepEqual(
      extracts.map(({id, superseded}) => [id, superseded]),
      [['260201T0000-bbb', undefined], ['260101T0000-aaa', true]]
    );
    assert.deepEqual((await getReportExtracts(true)).map(({id}) => id), ['260201T0000-bbb']);
    // The page history is chronological, whatever the descriptions.
    assert.deepEqual(
      (await getPageReportExtracts('p-mixedout')).map(({id}) => id), ['260101T0000-aaa', '260201T0000-bbb']
    );
    assert.deepEqual(await getPageReportExtracts(''), []);
    // The unmigrated report was not quarantined.
    assert.equal((await fs.readdir(tmpReportsDir)).includes('260301T0000-ccc.json'), true);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
  }
});
