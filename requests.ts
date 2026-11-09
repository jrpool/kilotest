/*
  requests.ts
  Processes requests to test pages, as described in docs/decisions/011-site-page-ontology.md. A request is submitted with immediate review, which creates a job at once if the request passes every check, or with management review, which adds it to the pending requests (testRequests.json) for a manager to approve or reject. A request with immediate review that has possible duplicates or similar sites is referred to management review. Submission, approval, and rejection all run under testRequestsLock, so that no two of them can act on stale facts about the pending requests, the jobs, or the registry.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';
import {sendAlert} from './alerts.ts';
import {
  getDomain, getHost, getRegistry, getSiteKey, getSitePages, isPageError, normalizeName, planPage, registerPage
} from './registry.ts';
import type {PageError, PageRecord, PageTarget, PlannedPage, RegisteredPage, Registry} from './registry.ts';
import {
  createLock,
  describeMax,
  errorMessage,
  getEnvMax,
  getJobNames,
  getJobsData,
  getJSON,
  getNowStamp,
  getPlainText,
  getRandomString,
  getReportExtract,
  getReportExtracts,
  jobsPath,
  minifyURL,
  testRequestsPath
} from './util.ts';

// TYPES

// The target of a submitted request: a page to be added, or the identifier of a report about a page to be retested.
export type RequestTarget = Exclude<PageTarget, {pageID: string}> | {reportID: string};
// An existing tested page that may be the requested page.
export type PossibleDuplicate = {pageID: string; reason: string};
// An existing site that may be the requested site.
export type SimilarSite = {siteID: string; reason: string};
// The possible duplicates and similar sites of a request.
export type Checks = {possibleDuplicates: PossibleDuplicate[]; similarSites: SimilarSite[]};
// A request awaiting approval.
export type TestRequest = {
  id: string;
  timeStamp: string;
  target: PageTarget;
  reason: string;
  referred: boolean;
} & Checks;
// The requests awaiting approval, by URL.
export type TestRequests = Record<string, TestRequest[]>;
// The result of starting a job.
export type StartResult = PageError | {result: 'ordered'; page: RegisteredPage; reportID: string};
// The result of submitting a request. Results other than 'pending' and 'ordered' are refusals:
//   nonreport: the report cited for a retest does not exist.
//   urlLength: the URL is not 12 to 300 characters long.
//   noSite, noPage, siteExists, pageExists: the target cannot be resolved (see PageError).
//   page: a job for the page is already queued or claimed.
//   url: a job for a page with an equivalent URL is already queued or claimed.
//   duplicate: an identical request is already pending.
//   superseded: the report cited for a retest is not the latest about its page.
//   queueFull: the pending requests (or, for an immediate order, the job queue) are full.
export type SubmitResult
= {result: 'nonreport' | 'urlLength'}
| PageError
| {result: 'page' | 'url' | 'duplicate' | 'superseded'; page: PlannedPage}
| ({result: 'queueFull' | 'pending'; page: PlannedPage; referred: boolean} & Checks)
| {result: 'ordered'; page: RegisteredPage; reportID: string};
// The result of approving a request.
export type ApproveResult = StartResult | {result: 'noRequest'};

// CONSTANTS

// The name of a site’s home page.
const homeName = 'home';
// The bounds on the lengths of site and page names.
export const nameBounds = {site: {min: 1, max: 80}, page: {min: 1, max: 120}} as const;

// FUNCTIONS

// Maximum number of requests awaiting approval at once, across all URLs. Once reached, a new, distinct request is refused rather than added, so the pending requests and the manager alerts they generate cannot grow without bound (see GitHub issue #3, abuse type 3). Configurable via TEST_REQUEST_QUEUE_MAX; 0 means no limit.
const testRequestQueueMax = () => getEnvMax('TEST_REQUEST_QUEUE_MAX', 20);
// Maximum number of jobs in the job queue at once. This queue is shared by every path that creates a job (immediate orders and approvals of pending requests), but only immediate orders are refused when it is full, since an approval is a manager’s decision. Configurable via JOB_QUEUE_MAX; 0 means no limit.
const jobQueueMax = () => getEnvMax('JOB_QUEUE_MAX', 20);
// Returns the total number of requests awaiting approval.
const getPendingCount = (testRequests: TestRequests): number =>
  Object.values(testRequests).reduce((total, requests) => total + requests.length, 0);
// Concurrency lock for submissions, approvals, and rejections of requests.
export const testRequestsLock = createLock();
// Returns the requests awaiting approval.
export const getTestRequests = async (): Promise<TestRequests> => {
  let testRequestsJSON: string;
  try {
    testRequestsJSON = await fs.readFile(testRequestsPath(), 'utf8');
  }
  catch(error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(testRequestsPath(), '{}\n');
      return {};
    }
    throw new Error(`Test-requests file not readable (${errorMessage(error)})`, {cause: error});
  }
  try {
    return JSON.parse(testRequestsJSON) as TestRequests;
  }
  catch(error: unknown) {
    throw new Error('Test-requests file not JSON', {cause: error});
  }
};
// Saves the requests awaiting approval.
const saveTestRequests = (testRequests: TestRequests): Promise<void> =>
  fs.writeFile(testRequestsPath(), getJSON(testRequests));
// Rejects all requests awaiting approval for a URL, as a transaction.
export const rejectTestRequests = (url: string): Promise<void> => testRequestsLock(async (): Promise<void> => {
  const testRequests = await getTestRequests();
  delete testRequests[url];
  await saveTestRequests(testRequests);
});
// Creates a job to test a registered page and returns its identifier.
export const createJob = async (page: RegisteredPage, reason: string): Promise<string> => {
  const jobTemplateJSON = await fs.readFile(path.join(import.meta.dirname, 'job.json'), 'utf8');
  const job = JSON.parse(jobTemplateJSON);
  const nowStamp = getNowStamp();
  const jobName = `${nowStamp}-${getRandomString(3)}`;
  job.id = jobName;
  job.creationTimeStamp = nowStamp;
  job.executionTimeStamp = nowStamp;
  job.target.what = `${page.siteName} ${page.pageName}`;
  job.target.url = page.url;
  const {siteID, pageID, siteName, pageName} = page;
  job.sources = {...job.sources, siteID, pageID, siteName, pageName, reason};
  await fs.writeFile(path.join(jobsPath(), 'queue', `${jobName}.json`), getJSON(job));
  console.log(`Job ${jobName} created for ${job.target.what}`);
  return jobName;
};
// Registers the page of a target if necessary and creates a job to test it.
const startJob = async (target: PageTarget, reason: string): Promise<StartResult> => {
  const page = await registerPage(target);
  // If the target cannot be resolved:
  if (isPageError(page)) {
    return page;
  }
  return {result: 'ordered', page, reportID: await createJob(page, reason)};
};
// Returns the tested pages that may be a requested new page, and the sites that may be the site of a requested new site.
const getChecks = (
  registry: Registry, testedPageIDs: Set<string>, page: PlannedPage, finalURL: string
): Checks => {
  const miniURL = minifyURL(page.url);
  const miniFinalURL = minifyURL(finalURL);
  const possibleDuplicates: PossibleDuplicate[] = [];
  // For each tested page:
  for (const [pageID, {url}] of Object.entries(registry.pages).filter(([id]) => testedPageIDs.has(id))) {
    const miniPageURL = minifyURL(url);
    // If its URL is equivalent to the requested one:
    if (miniPageURL === miniURL) {
      possibleDuplicates.push({pageID, reason: 'Its URL is equivalent to the requested URL.'});
    }
    // Otherwise, if its URL is equivalent to the one the requested URL redirects to:
    else if (miniPageURL === miniFinalURL) {
      possibleDuplicates.push({pageID, reason: 'Its URL is equivalent to the URL to which the requested URL redirects.'});
    }
  }
  const similarSites: SimilarSite[] = [];
  // If the site is new:
  if (!page.siteID) {
    const siteKey = getSiteKey(page.siteName);
    const domain = getDomain(getHost(page.url));
    // For each existing site:
    for (const [siteID, siteName] of Object.entries(registry.sites)) {
      const home = getSitePages(registry, siteID).find(([, sitePage]) => normalizeName(sitePage.name) === homeName);
      // If its name is similar to the requested one:
      if (getSiteKey(siteName) === siteKey) {
        similarSites.push({
          siteID, reason: 'Its name differs from the requested site name only in case, punctuation, or a parenthesized part.'
        });
      }
      // Otherwise, if its home page has the domain of the requested page:
      else if (home && getDomain(getHost(home[1].url)) === domain) {
        similarSites.push({siteID, reason: 'Its home page has the same domain as the requested page.'});
      }
    }
  }
  return {possibleDuplicates, similarSites};
};
// Returns a new request identifier not used by any request awaiting approval.
const getRequestID = (testRequests: TestRequests): string => {
  const usedIDs = new Set(Object.values(testRequests).flat().map(request => request.id));
  let id: string;
  // Generate identifiers until one is unused.
  do {
    id = `q-${getRandomString(6)}`;
  } while (usedIDs.has(id));
  return id;
};
// Submits a request as a transaction and returns the result. finalURL is the URL to which the requested URL redirects, if known.
export const submitTestRequest = ({target, reason, reviewImmediately, finalURL = ''}: {
  target: RequestTarget; reason: string; reviewImmediately: boolean; finalURL?: string;
}): Promise<SubmitResult> => testRequestsLock(async (): Promise<SubmitResult> => {
  let pageTarget: PageTarget;
  // Whether the cited report (for a retest) has been superseded by a later one.
  let superseded = false;
  const reportExtracts = await getReportExtracts();
  // If the target identifies a report about a page to retest:
  if ('reportID' in target) {
    const {reportID} = target;
    const extract = await getReportExtract(reportID);
    // If the report does not exist:
    if ('error' in extract) {
      return {result: 'nonreport'};
    }
    pageTarget = {pageID: extract.pageID};
    superseded = reportExtracts.some(ex => ex.id === reportID && ex.superseded);
  }
  // Otherwise, i.e. if the target is a page to add:
  else {
    // If the URL violates the 12-to-300-character bound:
    if (target.url.length < 12 || target.url.length > 300) {
      return {result: 'urlLength'};
    }
    pageTarget = target;
  }
  const registry = await getRegistry();
  const page = planPage(registry, pageTarget);
  // If the target cannot be resolved:
  if (isPageError(page)) {
    return page;
  }
  try {
    const miniURL = minifyURL(page.url);
    // For each category of approved jobs:
    for (const category of ['claimed', 'queue'] as const) {
      const jobsData = await getJobsData(category);
      // If a job for the page is in it:
      if (page.pageID && jobsData.some(job => job.pageID === page.pageID)) {
        return {result: 'page', page};
      }
      // If a job for a page with an equivalent URL is in it:
      if (jobsData.some(job => minifyURL(job.url) === miniURL)) {
        return {result: 'url', page};
      }
    }
    const testRequests = await getTestRequests();
    const targetJSON = JSON.stringify(pageTarget);
    // If an identical request is awaiting approval:
    if (testRequests[page.url]?.some(
      request => JSON.stringify(request.target) === targetJSON && request.reason === reason
    )) {
      return {result: 'duplicate', page};
    }
    // If the cited report has been superseded:
    if (superseded) {
      return {result: 'superseded', page};
    }
    const testedPageIDs = new Set(reportExtracts.filter(ex => !ex.superseded).map(ex => ex.pageID));
    // Get the possible duplicates and similar sites of a page to add.
    const checks = page.pageID ? {possibleDuplicates: [], similarSites: []} : getChecks(
      registry, testedPageIDs, page, finalURL
    );
    const referred = reviewImmediately && (checks.possibleDuplicates.length + checks.similarSites.length > 0);
    // If immediate review was requested and the request passes every check:
    if (reviewImmediately && !referred) {
      const queueMax = jobQueueMax();
      const {queue: queuedJobNames} = await getJobNames();
      // If the job queue is full:
      if (queueMax > 0 && queuedJobNames.length >= queueMax) {
        return {result: 'queueFull', page, referred, ...checks};
      }
      // Otherwise, create the job.
      return startJob(pageTarget, reason);
    }
    // Otherwise, i.e. if the request is for or referred to management review, if the pending requests are full:
    const queueMax = testRequestQueueMax();
    if (queueMax > 0 && getPendingCount(testRequests) >= queueMax) {
      return {result: 'queueFull', page, referred, ...checks};
    }
    // Otherwise, add the request to the pending requests.
    (testRequests[page.url] ??= []).push({
      id: getRequestID(testRequests),
      timeStamp: getNowStamp(),
      target: pageTarget,
      reason,
      referred,
      ...checks
    });
    await saveTestRequests(testRequests);
    // Alert a manager, including the resulting number of pending requests.
    const kind = page.pageID ? 'a retest' : 'a new test';
    const referral = referred ? ' (referred from immediate review)' : '';
    const checkCount = checks.possibleDuplicates.length + checks.similarSites.length;
    await sendAlert(
      `Kilotest: request for ${kind} awaits approval${referral}`,
      `Site: ${page.siteName}\nPage: ${page.pageName}\nURL: ${page.url}\nReason: ${getPlainText(reason)}\n` +
      `Possible duplicates and similar sites: ${checkCount}\n` +
      `Requests now awaiting approval: ${getPendingCount(testRequests)} of ${describeMax(queueMax)}`
    );
    return {result: 'pending', page, referred, ...checks};
  }
  catch(error) {
    throw new Error('Failed to process test request', {cause: error});
  }
});
// Approves a request awaiting approval as a transaction: creates a job for it and, if this succeeds, removes all requests awaiting approval for its URL.
export const approveTestRequest = (
  url: string, requestID: string
): Promise<ApproveResult> => testRequestsLock(async (): Promise<ApproveResult> => {
  const testRequests = await getTestRequests();
  const request = testRequests[url]?.find(pending => pending.id === requestID);
  // If the request does not exist:
  if (!request) {
    return {result: 'noRequest'};
  }
  const result = await startJob(request.target, request.reason);
  // If a job was created:
  if (result.result === 'ordered') {
    delete testRequests[url];
    await saveTestRequests(testRequests);
  }
  return result;
});
// Returns a human-readable statement of why a page error prevents a request or approval.
export const describePageError = (error: PageError, registry: Registry): string => {
  if (error.result === 'siteExists') {
    return `a site named “${registry.sites[error.siteID]}” (identifier ${error.siteID}) already exists, so request the test with its identifier as siteID instead.`;
  }
  if (error.result === 'pageExists') {
    return `the site already has a page named “${(registry.pages[error.pageID] as PageRecord).name}” (identifier ${error.pageID}).`;
  }
  if (error.result === 'noSite') {
    return 'the specified site does not exist.';
  }
  return 'the page of the specified report is not in the registry.';
};
// Returns why a request was refused, given a refusal result other than nonreport.
export const describeRefusal = (
  result: Exclude<SubmitResult, {result: 'nonreport' | 'pending' | 'ordered'}>, registry: Registry
): string => {
  switch (result.result) {
    case 'urlLength':
      return 'the URL is not between 12 and 300 characters long.';
    case 'page':
      return 'a test of the page is already approved and not yet complete.';
    case 'url':
      return 'a test of a page with an equivalent URL is already approved and not yet complete.';
    case 'duplicate':
      return 'an identical request is already awaiting approval.';
    case 'superseded':
      return 'a later report about the page is available.';
    case 'queueFull':
      return 'too many requests are awaiting approval right now. Please try again later, ' +
        'or post your request at https://github.com/jrpool/kilotest/issues or email info@kilotest.com.';
    default:
      return describePageError(result as PageError, registry);
  }
};
// Returns a label for the target of a request awaiting approval: the names of its site and page, marked if the site is new.
export const getTargetLabel = (registry: Registry, target: PageTarget): string => {
  if ('pageID' in target) {
    const page = registry.pages[target.pageID];
    return page ? `${registry.sites[page.sites[0] as string]} ${page.name} (retest)` : `${target.pageID} (retest of a page not in the registry)`;
  }
  if ('siteID' in target) {
    return `${registry.sites[target.siteID] ?? target.siteID} ${target.pageName}`;
  }
  return `${target.siteName} ${target.pageName} (new site)`;
};
// Returns a text with white space trimmed and each internal run of it reduced to one space.
export const normalizeSpace = (text: string): string => text.replace(/\s+/g, ' ').trim();
