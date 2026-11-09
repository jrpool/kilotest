/*
  requests.test.ts
  Tests for requests.ts.
*/

// IMPORTS

import {mock, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getRegistry, registryPath} from './registry.ts';
import type {Registry} from './registry.ts';
import {
  approveTestRequest,
  createJob,
  describePageError,
  describeRefusal,
  getTargetLabel,
  getTestRequests,
  normalizeSpace,
  rejectTestRequests,
  submitTestRequest
} from './requests.ts';
import type {SubmitResult, TestRequests} from './requests.ts';
import {getJSON, jobsPath, testRequestsPath} from './util.ts';

// CONSTANTS

// A reason long enough to be valid.
const reason = 'because accessibility matters here';
// A site created by tests that need a home page.
const homeSite = {
  siteID: 's-homesit',
  pageID: 'p-homesite',
  page: {sites: ['s-homesit'], name: 'Home', url: 'https://www.homesite.org/'}
};

// FUNCTIONS

// Runs an asynchronous function with DB_DIR pointing to a new copy of the fixture data directory, and then removes the copy.
const withDB = async (run: (dbDir: string) => Promise<void>, copyFixtures = true): Promise<void> => {
  const savedDBDir = process.env.DB_DIR;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilotest-requests-'));
  try {
    // If the fixtures are to be copied:
    if (copyFixtures) {
      fs.cpSync(path.join(import.meta.dirname, 'test', 'fixtures', 'db'), dbDir, {recursive: true});
      for (const category of ['queue', 'claimed', 'failed']) {
        fs.mkdirSync(path.join(dbDir, 'jobs', category), {recursive: true});
      }
    }
    process.env.DB_DIR = dbDir;
    await run(dbDir);
  }
  finally {
    if (savedDBDir === undefined) {
      delete process.env.DB_DIR;
    }
    else {
      process.env.DB_DIR = savedDBDir;
    }
    fs.rmSync(dbDir, {recursive: true, force: true});
  }
};
// Runs an asynchronous function with an environment variable set, and then restores it.
const withEnv = async (name: string, value: string, run: () => Promise<void>): Promise<void> => {
  const saved = process.env[name];
  process.env[name] = value;
  try {
    await run();
  }
  finally {
    if (saved === undefined) {
      delete process.env[name];
    }
    else {
      process.env[name] = saved;
    }
  }
};
// Changes the registry in the current data directory.
const editRegistry = async (edit: (registry: Registry) => void): Promise<void> => {
  const registry = await getRegistry();
  edit(registry);
  fs.writeFileSync(registryPath(), getJSON(registry));
};
// Adds a site with a home page to the registry.
const addHomeSite = () => editRegistry(registry => {
  registry.sites[homeSite.siteID] = 'Home Site';
  registry.pages[homeSite.pageID] = homeSite.page;
});
// Writes a job file into a job category.
const writeJob = (category: 'queue' | 'claimed', name: string, job: unknown): void => {
  fs.writeFileSync(path.join(jobsPath(), category, `${name}.json`), getJSON(job));
};
// Returns the job in the queue with an identifier.
const readJob = (jobID: string) => JSON.parse(fs.readFileSync(path.join(jobsPath(), 'queue', `${jobID}.json`), 'utf8'));
// Returns the pending requests.
const readRequests = (): TestRequests => JSON.parse(fs.readFileSync(testRequestsPath(), 'utf8'));

// TESTS

test('getTestRequests creates an empty file if none exists, and throws if the file is defective', async () => {
  await withDB(async dbDir => {
    fs.mkdirSync(path.join(dbDir, 'jobs'), {recursive: true});
    assert.deepEqual(await getTestRequests(), {});
    assert.equal(fs.readFileSync(testRequestsPath(), 'utf8'), '{}\n');
    fs.writeFileSync(testRequestsPath(), 'not JSON');
    await assert.rejects(getTestRequests(), /not JSON/);
    fs.rmSync(testRequestsPath());
    fs.mkdirSync(testRequestsPath());
    await assert.rejects(getTestRequests(), /not readable/);
  }, false);
});
test('submitTestRequest records a request for a page of a new site for management review', async () => {
  await withDB(async () => {
    const result = await submitTestRequest({
      target: {siteName: 'New Org', pageName: 'home', url: 'https://neworg.example/'}, reason, reviewImmediately: false
    });
    assert.deepEqual(result, {
      result: 'pending',
      page: {siteID: null, siteName: 'New Org', pageID: null, pageName: 'home', url: 'https://neworg.example/'},
      referred: false,
      possibleDuplicates: [],
      similarSites: []
    });
    const [request] = readRequests()['https://neworg.example/'] ?? [];
    assert.match(request?.id ?? '', /^q-[0-9a-z]{6}$/);
    assert.deepEqual(request?.target, {siteName: 'New Org', pageName: 'home', url: 'https://neworg.example/'});
    assert.equal(request?.referred, false);
    // The registry is unchanged until approval.
    assert.equal(Object.keys((await getRegistry()).sites).length, 1);
    // An identical request is a duplicate.
    const duplicate = await submitTestRequest({
      target: {siteName: 'New Org', pageName: 'home', url: 'https://neworg.example/'}, reason, reviewImmediately: false
    });
    assert.equal(duplicate.result, 'duplicate');
  });
});
test('submitTestRequest refuses unresolvable targets and URLs of invalid length', async () => {
  await withDB(async () => {
    const submit = (target: Parameters<typeof submitTestRequest>[0]['target']) => submitTestRequest({
      target, reason, reviewImmediately: true
    });
    assert.deepEqual(await submit({siteName: 'X', pageName: 'home', url: 'https://x.c'}), {result: 'urlLength'});
    assert.deepEqual(
      await submit({siteName: 'X', pageName: 'home', url: `https://x.example/${'a'.repeat(300)}`}), {result: 'urlLength'}
    );
    assert.deepEqual(
      await submit({siteName: 'fixture site', pageName: 'home', url: 'https://fixture.example/'}),
      {result: 'siteExists', siteID: 's-fixtur'}
    );
    assert.deepEqual(
      await submit({siteID: 's-zzzzzz', pageName: 'home', url: 'https://fixture.example/'}), {result: 'noSite'}
    );
    assert.deepEqual(
      await submit({siteID: 's-fixtur', pageName: 'mixed outcomes', url: 'https://fixture.example/'}),
      {result: 'pageExists', pageID: 'p-mixedout'}
    );
    assert.deepEqual(await submit({reportID: '990101T0000-zzz'}), {result: 'nonreport'});
    await editRegistry(registry => {
      delete registry.pages['p-canttell'];
    });
    assert.deepEqual(await submit({reportID: '260101T0001-ct'}), {result: 'noPage'});
  });
});
test('submitTestRequest handles retests of superseded and latest reports', async () => {
  await withDB(async () => {
    const superseded = await submitTestRequest({target: {reportID: '260101T0000-mix'}, reason, reviewImmediately: false});
    assert.equal(superseded.result, 'superseded');
    const pending = await submitTestRequest({target: {reportID: '260202T0000-new'}, reason, reviewImmediately: false});
    assert.equal(pending.result, 'pending');
    assert.deepEqual(readRequests()['https://example.com/mixed']?.[0]?.target, {pageID: 'p-mixedout'});
    const ordered = await submitTestRequest({target: {reportID: '260101T0009-brd'}, reason, reviewImmediately: true});
    assert.equal(ordered.result, 'ordered');
    const {reportID} = ordered as Extract<SubmitResult, {result: 'ordered'}>;
    const job = readJob(reportID);
    assert.equal(job.target.what, 'Fixture Site Branch Coverage Page');
    assert.equal(job.target.url, 'https://example.com/branch');
    assert.deepEqual(
      {siteID: job.sources.siteID, pageID: job.sources.pageID, reason: job.sources.reason},
      {siteID: 's-fixtur', pageID: 'p-branchco', reason}
    );
    // A retest of a page whose job is queued is refused.
    const again = await submitTestRequest({target: {reportID: '260101T0009-brd'}, reason, reviewImmediately: true});
    assert.equal(again.result, 'page');
  });
});
test('submitTestRequest refuses pages with claimed or queued jobs', async () => {
  await withDB(async () => {
    writeJob('claimed', 'claimed', {sources: {pageID: 'p-emptyres'}, target: {url: 'https://example.com/empty'}});
    writeJob('queue', 'queued', {target: {url: 'https://www.example.com/queued/'}});
    const claimed = await submitTestRequest({target: {reportID: '260101T0005-emp'}, reason, reviewImmediately: false});
    assert.equal(claimed.result, 'page');
    const queued = await submitTestRequest({
      target: {siteID: 's-fixtur', pageName: 'Queued', url: 'https://example.com/queued'}, reason, reviewImmediately: false
    });
    assert.equal(queued.result, 'url');
    fs.writeFileSync(path.join(jobsPath(), 'claimed', 'defective.json'), 'not JSON');
    await assert.rejects(
      submitTestRequest({target: {reportID: '260101T0005-emp'}, reason, reviewImmediately: false}),
      /Failed to process test request/
    );
  });
});
test('submitTestRequest refers a request with possible duplicates to management review', async () => {
  await withDB(async () => {
    const sameURL = await submitTestRequest({
      target: {siteID: 's-fixtur', pageName: 'Other', url: 'https://www.example.com/mixed/'}, reason, reviewImmediately: true
    });
    assert.equal(sameURL.result, 'pending');
    assert.deepEqual(
      (sameURL as Extract<SubmitResult, {referred: boolean}>).possibleDuplicates,
      [{pageID: 'p-mixedout', reason: 'Its URL is equivalent to the requested URL.'}]
    );
    assert.equal((sameURL as Extract<SubmitResult, {referred: boolean}>).referred, true);
    assert.equal(readRequests()['https://www.example.com/mixed/']?.[0]?.referred, true);
    const redirected = await submitTestRequest({
      target: {siteID: 's-fixtur', pageName: 'Redirector', url: 'https://example.com/redirector'},
      reason,
      reviewImmediately: false,
      finalURL: 'https://example.com/branch'
    });
    assert.deepEqual(
      (redirected as Extract<SubmitResult, {referred: boolean}>).possibleDuplicates,
      [{pageID: 'p-branchco', reason: 'Its URL is equivalent to the URL to which the requested URL redirects.'}]
    );
    // A page with only hidden reports is not a tested page.
    const hidden = await submitTestRequest({
      target: {siteID: 's-fixtur', pageName: 'Hidden Again', url: 'https://example.com/hidden'}, reason, reviewImmediately: true
    });
    assert.equal(hidden.result, 'ordered');
  });
});
test('submitTestRequest reports sites with similar names or home-page domains', async () => {
  await withDB(async () => {
    await addHomeSite();
    const byName = await submitTestRequest({
      target: {siteName: 'Fixture Site (FS)', pageName: 'home', url: 'https://fs.example/'}, reason, reviewImmediately: true
    });
    assert.deepEqual((byName as Extract<SubmitResult, {referred: boolean}>).similarSites, [{
      siteID: 's-fixtur',
      reason: 'Its name differs from the requested site name only in case, punctuation, or a parenthesized part.'
    }]);
    const byDomain = await submitTestRequest({
      target: {siteName: 'Shop', pageName: 'home', url: 'https://shop.homesite.org/'}, reason, reviewImmediately: false
    });
    assert.deepEqual((byDomain as Extract<SubmitResult, {referred: boolean}>).similarSites, [{
      siteID: homeSite.siteID, reason: 'Its home page has the same domain as the requested page.'
    }]);
  });
});
test('submitTestRequest creates a job for a request that passes every check under immediate review', async () => {
  await withDB(async () => {
    const result = await submitTestRequest({
      target: {siteName: 'New Org', pageName: 'home', url: 'https://neworg.example/'}, reason, reviewImmediately: true
    });
    assert.equal(result.result, 'ordered');
    const {page, reportID} = result as Extract<SubmitResult, {result: 'ordered'}>;
    assert.equal((await getRegistry()).sites[page.siteID], 'New Org');
    const job = readJob(reportID);
    assert.equal(job.target.what, 'New Org home');
    assert.deepEqual(
      {siteName: job.sources.siteName, pageName: job.sources.pageName, pageID: job.sources.pageID},
      {siteName: 'New Org', pageName: 'home', pageID: page.pageID}
    );
    assert.equal(job.sources.application, 'Kilotest');
    // No request is pending.
    assert.deepEqual(readRequests(), {});
  });
});
test('submitTestRequest honors the limits on the job queue and the pending requests', async () => {
  await withDB(async () => {
    const submit = (url: string, reviewImmediately: boolean) => submitTestRequest({
      target: {siteID: 's-fixtur', pageName: url, url}, reason, reviewImmediately
    });
    writeJob('queue', 'filler', {target: {url: 'https://example.com/filler'}});
    await withEnv('JOB_QUEUE_MAX', '1', async () => {
      const full = await submit('https://example.com/full1', true);
      assert.deepEqual(
        {result: full.result, referred: (full as Extract<SubmitResult, {referred: boolean}>).referred},
        {result: 'queueFull', referred: false}
      );
    });
    await withEnv('JOB_QUEUE_MAX', '0', async () => {
      assert.equal((await submit('https://example.com/unlimited1', true)).result, 'ordered');
    });
    await withEnv('TEST_REQUEST_QUEUE_MAX', '1', async () => {
      assert.equal((await submit('https://example.com/pending1', false)).result, 'pending');
      assert.equal((await submit('https://example.com/pending2', false)).result, 'queueFull');
    });
    await withEnv('TEST_REQUEST_QUEUE_MAX', '0', async () => {
      assert.equal((await submit('https://example.com/pending3', false)).result, 'pending');
    });
  });
});
test('submitTestRequest regenerates a request identifier that is already used', async () => {
  await withDB(async () => {
    const submit = (url: string) => submitTestRequest({target: {siteID: 's-fixtur', pageName: url, url}, reason, reviewImmediately: false});
    let callCount = 0;
    // Make the first two identifiers all zeros and the third all ones.
    const random = mock.method(Math, 'random', () => callCount++ < 12 ? 0 : 1 / 36);
    try {
      await submit('https://example.com/first');
      await submit('https://example.com/second');
    }
    finally {
      random.mock.restore();
    }
    const requests = readRequests();
    assert.equal(requests['https://example.com/first']?.[0]?.id, 'q-000000');
    assert.equal(requests['https://example.com/second']?.[0]?.id, 'q-111111');
  });
});
test('approveTestRequest creates a job and removes the requests for its URL, unless the target is no longer valid', async () => {
  await withDB(async () => {
    const url = 'https://neworg.example/';
    await submitTestRequest({target: {siteName: 'New Org', pageName: 'home', url}, reason, reviewImmediately: false});
    await submitTestRequest({
      target: {siteName: 'New Org', pageName: 'about', url: `${url}about`}, reason, reviewImmediately: false
    });
    assert.deepEqual(await approveTestRequest(url, 'q-zzzzzz'), {result: 'noRequest'});
    assert.deepEqual(await approveTestRequest('https://other.example/', 'q-zzzzzz'), {result: 'noRequest'});
    const [first] = readRequests()[url] ?? [];
    const approved = await approveTestRequest(url, first?.id ?? '');
    assert.equal(approved.result, 'ordered');
    const {page, reportID} = approved as Extract<SubmitResult, {result: 'ordered'}>;
    assert.equal(readJob(reportID).sources.pageID, page.pageID);
    assert.equal(readRequests()[url], undefined);
    // The site now exists, so a request naming it as a new site cannot be approved.
    const [second] = readRequests()[`${url}about`] ?? [];
    assert.deepEqual(
      await approveTestRequest(`${url}about`, second?.id ?? ''), {result: 'siteExists', siteID: page.siteID}
    );
    assert.equal(readRequests()[`${url}about`]?.length, 1);
    await rejectTestRequests(`${url}about`);
    assert.deepEqual(readRequests(), {});
  });
});
test('createJob writes a job with the names and identifiers of the page', async () => {
  await withDB(async () => {
    const jobID = await createJob({
      siteID: 's-fixtur', siteName: 'Fixture Site', pageID: 'p-mixedout', pageName: 'Mixed Outcomes', url: 'https://example.com/mixed'
    }, reason);
    assert.match(jobID, /^\d{6}T\d{4}-[0-9a-z]{3}$/);
    const job = readJob(jobID);
    assert.equal(job.id, jobID);
    assert.equal(job.creationTimeStamp, jobID.slice(0, 11));
    assert.deepEqual(job.sources, {
      application: 'Kilotest',
      siteID: 's-fixtur',
      pageID: 'p-mixedout',
      siteName: 'Fixture Site',
      pageName: 'Mixed Outcomes',
      reason
    });
  });
});
test('describeRefusal and describePageError explain every refusal', () => {
  const registry: Registry = {
    sites: {'s-aaaaaa': 'A Site'},
    pages: {'p-aaaaaaaa': {sites: ['s-aaaaaa'], name: 'A Page', url: 'https://a.example/'}}
  };
  const page = {siteID: 's-aaaaaa', siteName: 'A Site', pageID: 'p-aaaaaaaa', pageName: 'A Page', url: 'https://a.example/'};
  const checks = {referred: false, possibleDuplicates: [], similarSites: []};
  const reasons = [
    describeRefusal({result: 'urlLength'}, registry),
    describeRefusal({result: 'page', page}, registry),
    describeRefusal({result: 'url', page}, registry),
    describeRefusal({result: 'duplicate', page}, registry),
    describeRefusal({result: 'superseded', page}, registry),
    describeRefusal({result: 'queueFull', page, ...checks}, registry),
    describeRefusal({result: 'siteExists', siteID: 's-aaaaaa'}, registry),
    describeRefusal({result: 'pageExists', pageID: 'p-aaaaaaaa'}, registry),
    describeRefusal({result: 'noSite'}, registry),
    describeRefusal({result: 'noPage'}, registry)
  ];
  assert.equal(new Set(reasons).size, reasons.length);
  assert.match(reasons[6] ?? '', /“A Site” \(identifier s-aaaaaa\)/);
  assert.match(reasons[7] ?? '', /“A Page” \(identifier p-aaaaaaaa\)/);
  assert.equal(describePageError({result: 'noSite'}, registry), reasons[8]);
});
test('getTargetLabel labels new sites, new pages, and retests', () => {
  const registry: Registry = {
    sites: {'s-aaaaaa': 'A Site'},
    pages: {'p-aaaaaaaa': {sites: ['s-aaaaaa'], name: 'A Page', url: 'https://a.example/'}}
  };
  assert.equal(getTargetLabel(registry, {pageID: 'p-aaaaaaaa'}), 'A Site A Page (retest)');
  assert.equal(getTargetLabel(registry, {pageID: 'p-zzzzzzzz'}), 'p-zzzzzzzz (retest of a page not in the registry)');
  assert.equal(getTargetLabel(registry, {siteID: 's-aaaaaa', pageName: 'B', url: 'https://a.example/b'}), 'A Site B');
  assert.equal(getTargetLabel(registry, {siteID: 's-zzzzzz', pageName: 'B', url: 'https://a.example/b'}), 's-zzzzzz B');
  assert.equal(getTargetLabel(registry, {siteName: 'C', pageName: 'home', url: 'https://c.example/'}), 'C home (new site)');
});
test('normalizeSpace trims white space and reduces internal runs of it', () => {
  assert.equal(normalizeSpace('  A \t site\n name '), 'A site name');
});
