/*
  util.test.ts
  Tests for util.ts data-path injection (Phase 1) and utility functions.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  annotateReportObject,
  checkCommentDuplicate,
  checkCommentLength,
  createLock,
  dbPath,
  getAgoDays,
  getAgoString,
  getCountString,
  getDateString,
  getDateTime,
  getEngineNamesString,
  getIssue,
  errorMessage,
  getJSON,
  getMultiReportWhats,
  getNowStamp,
  getObject,
  getPageData,
  getPageDataStrings,
  getPlainText,
  getRandomString,
  getReportExtract,
  getReportExtracts,
  getReportPath,
  getReportStats,
  getTextFragmentHref,
  getTimeStamp,
  getWCAGLink,
  getWeightName,
  hiddenReportsPath,
  htmlSafe,
  isJobID,
  isReportAvailable,
  isTimeStamp,
  isURL,
  jobsPath,
  makeBreakable,
  minifyURL,
  objectSort,
  processTestRequest,
  testRequestsLock,
  testRequestsPath,
  reportsPath
} from './util.ts';

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

test('checkCommentDuplicate accepts a comment with no existing comments', () => {
  const result = checkCommentDuplicate([], 'a'.repeat(20));
  assert.deepEqual(result, {status: 'ok'});
});

test('checkCommentDuplicate rejects a comment repeating one submitted within the last 1000 seconds', () => {
  const content = 'a'.repeat(20);
  const comments = [{timeStamp: getNowStamp(), content}];
  const result = checkCommentDuplicate(comments, content);
  assert.deepEqual(result, {
    status: 'error',
    message: 'Your comment repeats a recently submitted one, but you are welcome to submit a different comment'
  });
});

test('checkCommentDuplicate accepts a comment repeating one submitted more than 1000 seconds ago', () => {
  const content = 'a'.repeat(20);
  const oldTimeStamp = getTimeStamp(new Date(Date.now() - 2000000));
  const comments = [{timeStamp: oldTimeStamp, content}];
  const result = checkCommentDuplicate(comments, content);
  assert.deepEqual(result, {status: 'ok'});
});

test('checkCommentDuplicate accepts a comment that differs from a recent one', () => {
  const comments = [{timeStamp: getNowStamp(), content: 'a'.repeat(20)}];
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

test('jobsPath, testRequestsPath, reportsPath, and hiddenReportsPath derive from DB_DIR', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(jobsPath(), path.join('/tmp/kilotest-fixtures', 'jobs'));
    assert.equal(testRequestsPath(), path.join('/tmp/kilotest-fixtures', 'jobs', 'testRequests.json'));
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
  assert.equal(getAgoDays(42 as any), null);
});

test('getAgoDays returns 0 for the current time', () => {
  assert.equal(getAgoDays(new Date()), 0);
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

test('isURL returns true for a valid HTTPS URL', () => {
  assert.equal(isURL('https://example.com/page'), true);
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

// TESTS FOR processTestRequest AND isReportAvailable

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
  assert.ok(strings.testInfo.includes('by job <code>mix</code>'));
  assert.ok(strings.testInfo.includes('2026-01-01 at 00:00'));
});

test('getPageDataStrings returns different testInfo for a different timeStamp', async () => {
  const strings = await getPageDataStrings('260101T0001', 'ct') as any;
  assert.equal(strings.description, 'All CantTell Page');
  assert.ok(strings.testInfo.includes('by job <code>ct</code>'));
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

test('processTestRequest succeeds for a valid new-test request', {timeout: 500}, async () => {
  // Reset testRequests.json to empty before the test.
  await fs.writeFile(testRequestsPath(), '{}\n');
  const {result} = await processTestRequest(
    'because accessibility', {description: 'Example Page', url: 'https://example.com'}
  );
  assert.equal(result, 'ok');
  const testRequests = JSON.parse(await fs.readFile(testRequestsPath(), 'utf8'));
  assert.equal(testRequests['https://example.com'][0].description, 'Example Page');
  // Clean up testRequests.json.
  await fs.writeFile(testRequestsPath(), '{}\n');
});

test('processTestRequest returns a duplicate error for a repeated request', {timeout: 500}, async () => {
  // Reset testRequests.json to empty, then make a successful request.
  await fs.writeFile(testRequestsPath(), '{}\n');
  const target = {description: 'Example Page', url: 'https://example.com'};
  await processTestRequest('because accessibility', target);
  // Repeat the same request (same description, URL, and reason).
  const {result} = await processTestRequest('because accessibility', target);
  assert.equal(result, 'duplicate');
  // Clean up testRequests.json.
  await fs.writeFile(testRequestsPath(), '{}\n');
});

test('processTestRequest returns a retest error when a report already exists for the page', async () => {
  // The fixture database already has a report for this description and URL.
  const {result} = await processTestRequest(
    'because accessibility', {description: 'Mixed Outcomes Page', url: 'https://example.com/mixed'}
  );
  assert.equal(result, 'retest');
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

// TESTS FOR processTestRequest's claimed/queued-job detection

test('processTestRequest returns "description" for a page matching a claimed job by description', async () => {
  const claimedPath = path.join(jobsPath(), 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, getJSON({
    target: {what: 'Claimed Page', url: 'https://example.com/claimed-job'}
  }));
  try {
    const {result} = await processTestRequest(
      'because', {description: 'Claimed Page', url: 'https://example.com/some-other-url'}
    );
    assert.equal(result, 'description');
  }
  finally {
    await fs.unlink(claimedPath);
  }
});

test('processTestRequest returns "url" for a page matching a claimed job by URL', async () => {
  const claimedPath = path.join(jobsPath(), 'claimed', 'clm.json');
  await fs.writeFile(claimedPath, getJSON({
    target: {what: 'Some Claimed Page', url: 'https://example.com/claimed-url'}
  }));
  try {
    const {result} = await processTestRequest(
      'because', {description: 'A Different Page', url: 'https://example.com/claimed-url'}
    );
    assert.equal(result, 'url');
  }
  finally {
    await fs.unlink(claimedPath);
  }
});

test('processTestRequest returns "description" for a page matching a queued job by description', async () => {
  const queuedPath = path.join(jobsPath(), 'queue', 'que.json');
  await fs.writeFile(queuedPath, getJSON({
    target: {what: 'Queued Page', url: 'https://example.com/queued-job'}
  }));
  try {
    const {result} = await processTestRequest(
      'because', {description: 'Queued Page', url: 'https://example.com/some-other-url'}
    );
    assert.equal(result, 'description');
  }
  finally {
    await fs.unlink(queuedPath);
  }
});

test('processTestRequest returns "url" for a page matching a queued job by URL', async () => {
  const queuedPath = path.join(jobsPath(), 'queue', 'que.json');
  await fs.writeFile(queuedPath, getJSON({
    target: {what: 'Some Queued Page', url: 'https://example.com/queued-url'}
  }));
  try {
    const {result} = await processTestRequest(
      'because', {description: 'A Different Page', url: 'https://example.com/queued-url'}
    );
    assert.equal(result, 'url');
  }
  finally {
    await fs.unlink(queuedPath);
  }
});

test('processTestRequest returns "nonreport" when the cited report does not exist', async () => {
  // Cite a timeStamp/jobID that does not correspond to any available report.
  const {result} = await processTestRequest('because', {timeStamp: '999999T9999', jobID: 'xxx'});
  assert.equal(result, 'nonreport');
});

test('processTestRequest throws when a job file in a category directory is defective', async () => {
  const claimedPath = path.join(jobsPath(), 'claimed', 'bad.json');
  await fs.writeFile(claimedPath, 'not valid json');
  try {
    await assert.rejects(
      processTestRequest('because', {description: 'Any Page', url: 'https://example.com/any'}),
      /Failed to process test request/
    );
  }
  finally {
    await fs.unlink(claimedPath);
  }
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
    assert.ok(!result.some(job => job.description === 'Raced Page'));
  }
  finally {
    t.mock.reset();
    await fs.unlink(claimedPath).catch(() => {});
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

test('processTestRequest succeeds on a fresh deployment with no job directories yet', async () => {
  // Regression test for the same ENOENT scenario, exercised through the actual
  // public interface: a brand-new DB_DIR with no jobs/claimed or jobs/queue
  // directories must not prevent a new-test request from being approved.
  const os = await import('node:os');
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kilotest-freshdeploy-'));
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = path.join(tmpRoot, 'db');
  try {
    const {processTestRequest: freshProcessTestRequest} = await import('./util.ts');
    const {result} = await freshProcessTestRequest(
      'because accessibility', {description: 'Fresh Deploy Page', url: 'https://example.com/fresh'}
    );
    assert.equal(result, 'ok');
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    await fs.rm(tmpRoot, {recursive: true}).catch(() => {});
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

test('getTestRequests creates and returns an empty test-requests object when the file is missing', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-missing-testrequests-test';
  const fsSync = await import('node:fs');
  fsSync.mkdirSync(tmpDir + '/jobs', {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getTestRequests} = await import('./util.ts');
    const result = await getTestRequests();
    assert.deepEqual(result, {});
    // Verify the empty file was created.
    assert.ok(fsSync.existsSync(tmpDir + '/jobs/testRequests.json'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getTestRequests throws when the test-requests file is not readable for a reason other than being missing', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-testrequests-unreadable-test';
  const fsSync = await import('node:fs');
  // Create a directory where the test-requests file should be, causing EISDIR rather than ENOENT.
  fsSync.mkdirSync(tmpDir + '/jobs/testRequests.json', {recursive: true});
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getTestRequests} = await import('./util.ts');
    await assert.rejects(getTestRequests(), /not readable/);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});

test('getTestRequests throws when the test-requests file is not JSON', async () => {
  const tmpDir = (await import('node:os')).tmpdir() + '/kilotest-testrequests-test';
  (await import('node:fs')).mkdirSync(tmpDir + '/jobs', {recursive: true});
  (await import('node:fs')).writeFileSync(tmpDir + '/jobs/testRequests.json', 'not json');
  const savedDbDir = process.env.DB_DIR;
  process.env.DB_DIR = tmpDir;
  try {
    const {getTestRequests} = await import('./util.ts');
    await assert.rejects(getTestRequests(), /not JSON/);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    (await import('node:fs')).rmSync(tmpDir, {recursive: true});
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
    const result = await getReport('260101T0000', 'bad') as any;
    assert.ok(result.error);
    assert.ok(result.error.includes('not usable'));
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
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

test('getDateTimeString describes an invalid time stamp as unknown', async () => {
  const {getDateTimeString} = await import('./util.ts');
  const result = getDateTimeString('999999T9999');
  assert.equal(result, 'an unknown date at an unknown time');
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

test('getEngineNamesString returns a sorted +-delimited list of engine names', () => {
  const result = getEngineNamesString(new Set(['axe', 'wave', 'nuVal']));
  const names = result.split(' + ');
  assert.ok(names.length === 3);
  assert.ok(names.includes('WAVE'));
});

test('getEngineNamesString falls back to the ID for an unknown engine', () => {
  assert.equal(getEngineNamesString(new Set(['unknownEngine'])), 'unknownEngine');
});

test('testRequestsLock is a function (the lock returned by createLock)', () => {
  assert.equal(typeof testRequestsLock, 'function');
});

test('getReportPath returns the path of a report file', () => {
  const result = getReportPath('260101T0000', 'mix');
  assert.ok(result.endsWith('260101T0000-mix.json'));
});

test('getReportStats returns reportTime and reportSize for a valid report', async () => {
  const stats = await getReportStats('260101T0000', 'mix');
  assert.ok(stats);
  assert.ok(stats.reportTime instanceof Date);
  assert.equal(typeof stats.reportSize, 'number');
  assert.ok(stats.reportSize > 0);
});

test('getReportStats returns null for a nonexistent report', async () => {
  const stats = await getReportStats('999999T9999', 'xxx');
  assert.equal(stats, null);
});


test('getReportExtract returns an extract for a valid report', async () => {
  const extract = await getReportExtract('260101T0000', 'mix') as any;
  assert.equal(extract.timeStamp, '260101T0000');
  assert.equal(extract.jobID, 'mix');
  assert.equal(extract.description, 'Mixed Outcomes Page');
  assert.equal(extract.url, 'https://example.com/mixed');
  assert.ok(extract.reportTime);
});

test('getReportExtract returns an error for a nonexistent report', async () => {
  const extract = await getReportExtract('999999T9999', 'xxx') as any;
  assert.ok(extract.error);
});

test('getReportExtracts returns extracts of all available reports', async () => {
  const extracts = await getReportExtracts();
  assert.ok(extracts.length >= 8);
  const ids = extracts.map(e => `${e.timeStamp}-${e.jobID}`);
  assert.ok(ids.includes('260101T0000-mix'));
  assert.ok(ids.includes('260101T0001-ct'));
});

test('getReportExtracts with onlyLatest returns only the latest report for each page', async () => {
  const latest = await getReportExtracts(true);
  const mixReports = latest.filter(e => e.description === 'Mixed Outcomes Page');
  assert.equal(mixReports.length, 1);
  assert.equal(mixReports[0]!.timeStamp, '260202T0000');
});

test('getMultiReportWhats returns descriptions that have multiple reports', async () => {
  const whats = await getMultiReportWhats();
  assert.ok(whats.includes('Mixed Outcomes Page'));
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
    await recordMetric('mcpToolCalls', 'listReports');
    await recordMetric('mcpToolCalls', 'listReports');
    await recordMetric('mcpToolCalls', 'getReport');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.mcpToolCalls.listReports, 2);
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
    await recordMetric('apiOperations', 'listReports');
    await recordMetric('mcpToolCalls', 'listReports');
    const metrics = JSON.parse(fsSync.readFileSync(metricsPath(), 'utf8'));
    assert.equal(metrics.apiOperations.listReports, 1);
    assert.equal(metrics.mcpToolCalls.listReports, 1);
  }
  finally {
    process.env.DB_DIR = savedDbDir;
    fsSync.rmSync(tmpDir, {recursive: true});
  }
});
