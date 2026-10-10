/*
  util.ts
  Utility functions.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {sendAlert} from './alerts.ts';
import {rules as ruleSpecs} from 'testaro-issues';
import type {Act, Catalog, Report, StandardInstance} from 'testaro';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import ipaddr from 'ipaddr.js';
import net from 'node:net';
import path from 'node:path';
import querystring from 'node:querystring';
/* c8 ignore stop */

// CONSTANTS

// Path of the data directory. Read afresh on every call (rather than cached at module load) so that tests can point Kilotest at a fixture directory via the DB_DIR environment variable.
export const dbPath = (): string => process.env.DB_DIR || path.join(import.meta.dirname, 'db');
// Path of the jobs directory.
export const jobsPath = (): string => path.join(dbPath(), 'jobs');
// Path of the test requests file.
export const testRequestsPath = (): string => path.join(jobsPath(), 'testRequests.json');
// Path of the reports directory.
export const reportsPath = (): string => path.join(dbPath(), 'reports');
// Path of the hidden-reports directory.
export const hiddenReportsPath = (): string => path.join(dbPath(), 'hiddenReports');
// Path of the usage-metrics file.
export const metricsPath = (): string => path.join(dbPath(), 'metrics.json');
// IDs, names, and sponsors of Testaro rule engines.
const ruleEngines: Record<string, [string, string]> = {
  alfa: ['Alfa', 'Siteimprove'],
  aslint: ['ASLint', 'eSSENTIAL Accessibility'],
  axe: ['Axe', 'Deque'],
  ed11y: ['Editoria11y', 'Princeton University'],
  htmlcs: ['HTML CodeSniffer', 'Squiz Labs'],
  ibm: ['Accessibility Checker', 'IBM'],
  nuVal: ['Html Checker API', 'World Wide Web Consortium'],
  nuVnu: ['Html Checker', 'World Wide Web Consortium'],
  pour: ['Pour', 'David Yarham and Geoffrey Crofte'],
  qualWeb: ['QualWeb', 'University of Lisbon'],
  surea11y: ['SureA11y', 'Jorge Rumoroso'],
  testaro: ['Testaro', 'CVS Health'],
  wave: ['WAVE', 'Utah State University'],
  wax: ['WallyAX', 'Wally']
};
export {ruleEngines};

// TYPES

// Usage-metrics categories, each a map from an event name (page name, MCP tool name, or
// API operation name) to a count of how many times it has occurred. managerActivity
// counts manager-only pages separately from pageViews, by outcome, since a spike in
// failed authCode attempts against a manager page is a signal of suspected abuse.
export type Metrics = {
  since: string;
  pageViews: Record<string, number>;
  mcpToolCalls: Record<string, number>;
  apiOperations: Record<string, number>;
  managerActivity: Record<string, {ok: number; error: number}>;
};

// Test request.
export type TestRequest = {
  timeStamp: string;
  description: string;
  reason: string;
};

// Test requests by URL.
export type TestRequests = Record<string, TestRequest[]>;

// Test request addition result. 'reportExists' means a report already exists about a
// page with the description or URL that a newTest request or order named (an outcome), distinct from the 'retest'
// requestType discriminant elsewhere in this file, which means the caller asked to
// retest a page that already has a report (a request kind); the two must not be
// confused with one another.
export type TestRequestResult
= 'url' | 'description' | 'reportExists' | 'duplicate' | 'superseded' | 'nonreport' | 'queueFull' | 'ok';

// Target of a new-test or retest request: a description and URL for a new-test request,
// or the timeStamp and jobID of the cited report for a retest request.
export type TestRequestTarget
= {description: string; url: string} | {timeStamp: string; jobID: string};

// Result of processTestRequest. description and url are absent only when the result
// is 'nonreport', i.e. when the target page could not be resolved; this is a
// discriminated union on result so that a check of result narrows their presence.
export type ProcessRequestResult
= {result: 'nonreport'} | {result: Exclude<TestRequestResult, 'nonreport'>; description: string; url: string};

// A StandardInstance extended with the issueID that Kilotest's annotateReportObject adds.
export interface AnnotatedInstance extends StandardInstance {
  issueID?: string;
}

// An Act whose standardResult instances (if any) are AnnotatedInstances.
// An intersection is used because Omit<Act, 'result'> would collapse Act's
// string index signature and lose its named properties.
export type AnnotatedAct = Act & {
  result?: {
    nativeResult?: unknown;
    standardResult?: {
      instances?: AnnotatedInstance[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

// The shape of a Report that has passed isUsableReport: optional fields that
// the guard verifies are narrowed to their required/non-null forms.
// error?: never is a discriminant: UsableReport.error is always undefined/never (falsy),
// so if (report.error) narrows a UsableReport | {error: string} union to {error: string},
// and the else/after-return branch is narrowed to UsableReport.
export type UsableReport = Omit<Report, 'target' | 'catalog' | 'jobData' | 'acts'> & {
  error?: never;
  id: string;
  target: {what: string; url: string};
  catalog: Catalog;
  jobData: NonNullable<Report['jobData']> & {endTime: string; issuelessRules?: string[]};
  acts: AnnotatedAct[];
};

// An extract of an available report.
export type ReportExtract = {
  timeStamp: string;
  jobID: string;
  description: string;
  url: string;
  reportTime: string;
  superseded?: boolean;
};

// MISCELLANEOUS FUNCTIONS

// Compares strings alphabetically and case-insensitively.
export const alphaCompare = (a: string, b: string) => a.localeCompare(b, 'en', {sensitivity: 'base'});
// Returns whether a string's length is within the given bounds. Generic length check
// shared by any field with a min/max character-count rule (e.g. a request description
// or reason), so each caller states its own bounds and label instead of hardcoding an
// ad hoc length comparison.
export const checkLength = (
  text: string, min: number, max: number, label: string
): {status: 'ok'} | {status: 'error'; message: string} => {
  const {length} = text;
  // If the length is invalid:
  if (length < min || length > max) {
    // Return the applicable error message.
    return {
      status: 'error',
      message: `The ${label} must be between ${min} and ${max} characters long`
    };
  }
  return {status: 'ok'};
};
// Returns whether a comment repeats, verbatim, one of the given comments, regardless
// of when the earlier one was submitted: a legitimate need to resubmit exactly the
// same content never arises (the near-term case is a browser "Back" resubmission),
// so storing a second copy would only ever be redundant. The content passed in
// should be the content as it will be stored (e.g. after sanitization), so that it
// is compared on the same basis as the stored comments. Content, not any time
// stamp, is what this checks and what identifies a comment as unique.
export const checkCommentDuplicate = (
  comments: {content: string}[], content: string
): {status: 'ok'} | {status: 'error'; message: string} => {
  // If the comment duplicates one already stored:
  if (comments.some(comment => comment.content === content)) {
    // Return this.
    return {
      status: 'error',
      message: 'Your comment is identical to one already submitted, but you are welcome to submit a different comment'
    };
  }
  // Otherwise, the comment is not a duplicate.
  return {status: 'ok'};
};
// Returns a function that executes a function sequentially.
export const createLock = (): (<T>(fn: () => T | Promise<T>) => Promise<T>) => {
  let queue: Promise<void> = Promise.resolve();
  return <T>(fn: () => T | Promise<T>): Promise<T> => {
    const result = queue.then(fn, fn);
    queue = result.then(() => {}, () => {});
    return result;
  };
};
// Returns the time in days since a Date or time stamp, or null if the argument is invalid.
export const getAgoDays = (timeArg: string | Date): number | null => {
  let dateTime;
  // If the argument is a string:
  if (typeof timeArg === 'string') {
    // Convert it from a time stamp to a Date, or null if invalid.
    dateTime = getDateTime(timeArg);
  }
  // Otherwise, if it is a Date:
  else if (timeArg instanceof Date) {
    // Convert it to null if it is invalid.
    dateTime = timeArg.toString() === 'Invalid Date' ? null : timeArg;
  }
  // Otherwise, i.e. if the argument is not a string or a Date:
  else {
    // Return this.
    return null;
  }
  // If the argument is invalid:
  if (!dateTime) {
    // Return this.
    return null;
  }
  // Otherwise, i.e. if it is valid, return the elapsed days since then.
  return Math.round((Date.now() - dateTime.getTime()) / (1000 * 60 * 60 * 24));
};
// Returns a date string from a time stamp.
export const getDateString = (timeStamp: string): string => {
  const dateString = `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
  // If the date part of the time stamp is valid:
  if (!isNaN(Date.parse(dateString))) {
    // Return a date string from it.
    return dateString;
  }
  // Otherwise, return a failure.
  return '';
};
// Returns the date and time represented by a time stamp.
export const getDateTime = (timeStamp: string): Date | null => {
  const dateString
  = `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}T${timeStamp.slice(7,9)}:${timeStamp.slice(9,11)}Z`;
  const dateTime = new Date(dateString);
  return dateTime.toString() === 'Invalid Date' ? null : dateTime;
};
// Returns the issue that a rule belongs to, or null if none.
export const getIssue = (engineID: string, ruleID: string): string | null => {
  const engineRules = ruleSpecs[engineID];
  // If the rule engine has no rule specifications:
  if (!engineRules) {
    // Return a failure result.
    return null;
  }
  const {invariant, variable} = engineRules;
  // If the rule ID is invariant and classified:
  if (invariant[ruleID]) {
    // Return its issue ID.
    return invariant[ruleID].issueID;
  }
  // Otherwise, find the first matching variable rule ID pattern.
  const variableRuleID = Object
  .keys(variable)
  .find(pattern => new RegExp(`^${pattern}$`).test(ruleID));
  // Return the issue ID if a pattern matched, or a failure result otherwise.
  return variableRuleID ? variable[variableRuleID]!.issueID : null;
};
// Returns the names of the files in a directory. A missing directory is a normal,
// recoverable condition (e.g. on first run, before anything has ever been written to
// it) and is created empty; any other failure to read it should never occur, so it is
// thrown rather than returned. label identifies the directory in the thrown message.
export const readdirOrCreate = async (dirPath: string, label: string): Promise<string[]> => {
  try {
    return await fs.readdir(dirPath);
  }
  catch(error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(dirPath, {recursive: true});
      return [];
    }
    throw new Error(`${label} not readable (${errorMessage(error)})`, {cause: error});
  }
};
// Gets the names and categories of the job files.
export const getJobNames = async (): Promise<{queue: string[], claimed: string[], failed: string[]}> => {
  const jobNames: {queue: string[], claimed: string[], failed: string[]} = {
    queue: [],
    claimed: [],
    failed: []
  };
  for (const category of ['queue', 'claimed', 'failed'] as const) {
    jobNames[category] = await readdirOrCreate(
      path.join(jobsPath(), category), `Job directory ${category}`
    );
  }
  return jobNames;
}
// Gets the descriptions and URLs of the pages of all jobs of a category. Uses
// getJobNames rather than reading the category directory directly, so that a
// missing directory (e.g. because no job has ever been claimed or queued yet on
// this deployment) is created empty instead of throwing ENOENT. A job file that
// disappears between the directory listing and the read of that specific file is
// likewise a normal, recoverable condition (a worker completed or reclaimed that
// job in the interim), so it is skipped rather than treated as defective.
export const getJobsData = async (category: 'queue' | 'claimed'): Promise<{description: string, url: string}[]> => {
  const jobsDir = path.join(jobsPath(), category);
  const jobFileNames = (await getJobNames())[category];
  // For each job in the category:
  const data: {description: string, url: string}[] = [];
  for (const jobFileName of jobFileNames) {
    const jobPath = path.join(jobsDir, jobFileName);
    let jobData: string;
    try {
      jobData = await fs.readFile(jobPath, 'utf8');
    }
    catch(error: unknown) {
      // If the job file has been removed since the directory was listed:
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Skip it.
        continue;
      }
      throw new Error(`Job file ${jobPath} defective`, {cause: error});
    }
    try {
      const job = JSON.parse(jobData);
      const {target} = job;
      data.push({
        description: target.what,
        url: target.url
      });
    }
    catch(error: unknown) {
      throw new Error(`Job file ${jobPath} defective`, {cause: error});
    }
  }
  return data;
};
// Returns the JSON stringification of an object, with a final newline.
export const getJSON = (object: unknown): string => `${JSON.stringify(object, null, 2)}\n`;
// Returns the message of an error, or its string representation if it is not an Error instance.
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
// Returns an object from a JSON file. A missing, unreadable, or non-JSON file should never
// occur for the files this is called on (job and report files Kilotest itself wrote), so
// failure is thrown rather than returned.
export const getObject = async (filePath: string): Promise<unknown> => {
  let fileContent;
  try {
    fileContent = await fs.readFile(filePath, 'utf8');
  }
  catch(error: unknown) {
    // The cause is preserved so that a caller for whom a missing file is a normal,
    // expected outcome (rather than one that should never occur) can distinguish it,
    // by its code, from any other (thrown) read failure.
    throw new Error(`File ${filePath} not readable (${errorMessage(error)})`, {cause: error});
  }
  try {
    return JSON.parse(fileContent);
  }
  catch(error: unknown) {
    throw new Error(`File ${filePath} not JSON (${errorMessage(error)})`, {cause: error});
  }
};
// Returns a random string.
export const getRandomString = (length: number): string => {
  let result = '';
  while (result.length < length) {
    result += Math.floor(Math.random() * 36).toString(36);
  }
  return result;
};
// Returns a time stamp from a date.
export const getTimeStamp = (date: Date): string => {
  const timeStamp = date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11);
  return timeStamp;
};
// Returns a time stamp for now.
export const getNowStamp = (): string => {
  return getTimeStamp(new Date());
};
// Converts a string to a plain-text 1-line ASCII string.
export const getPlainText = (string: string): string => string
.replace(/&/g, '+')
.replace(/[<>"']/g, ' ');
// Populates an index.html template in a directory with named values.
export const populateTemplate = async (dirName: string, query: Record<string, string>): Promise<string> => {
  // Get the template.
  let answerPage = await fs.readFile(path.join(dirName, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    // A replacer function keeps $-patterns in a value from being interpreted.
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), () => query[param]!);
  });
  return answerPage;
};
// Returns the data from a POST request. Resolves null for an unrecognized content-type or a
// malformed JSON body; callers treat null as an unreadable request.
export const getPOSTData = (request: import('node:http').IncomingMessage): Promise<unknown> => new Promise(resolve => {
  const bodyParts: Buffer[] = [];
  request.on('data', chunk => {
    bodyParts.push(chunk);
  });
  request.on('end', () => {
    const {headers} = request;
    const contentType = String(headers['content-type'] || headers['body-type'] || '');
    if (contentType.startsWith('application/json')) {
      const bodyJSON = bodyParts.join('');
      try {
        resolve(JSON.parse(bodyJSON));
      }
      catch {
        resolve(null);
      }
    }
    else if (contentType.startsWith('application/x-www-form-urlencoded')) {
      const body = bodyParts.join('');
      const query = querystring.parse(body);
      resolve(query);
    }
    else {
      resolve(null);
    }
  });
});
// Returns the test and retest requests awaiting approval.
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
// Makes a string HTML-safe.
export const htmlSafe = (string: string): string => string ? string
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&apos;')
: '';
// Returns whether a string is a job ID.
export const isJobID = (string: string): boolean => {
  return /^[a-z0-9]{3}$/.test(string);
};
// Returns whether a string is a time stamp.
export const isTimeStamp = (string: string): boolean => {
  return !!getDateString(string);
};
// Returns whether a string is a URL.
export const isURL = (string: string): boolean => {
  try {
    return string.startsWith('https://') && !!new URL(string);
  } catch {
    return false;
  }
};
// The ipaddr.js range labels, for each address family, that are not part of
// the public, globally routable address space and so must never be a testing
// target. Sourced from ipaddr.js's own IPv4/IPv6 SpecialRanges tables, which
// track the IANA special-purpose address registries (e.g. RFC 1918 private
// ranges, RFC 5737/3849 documentation ranges, RFC 6598 carrier-grade NAT,
// RFC 6890 link-local, including the 169.254.169.254 cloud-metadata address).
// A version bump of ipaddr.js is not pinned or specially reviewed here (this
// deployment always installs the latest of every dependency); instead, the
// isAllowedTarget/isAllowedRedirectTarget tests enumerate specific addresses
// in every one of these ranges, so a future release that narrowed this
// coverage would fail those tests rather than silently allowing an address
// that should be rejected.
const nonPublicIPv4Ranges = new Set([
  'unspecified', 'broadcast', 'multicast', 'linkLocal', 'loopback', 'carrierGradeNat', 'private', 'reserved'
]);
const nonPublicIPv6Ranges = new Set([
  'unspecified', 'linkLocal', 'multicast', 'loopback', 'uniqueLocal', 'deprecatedSiteLocal', 'discard',
  'rfc6145', 'rfc6052', '6to4', 'teredo', 'benchmarking', 'amt', 'as112v6', 'deprecatedOrchid', 'orchid2'
]);
// Returns whether an IP address (v4 or v6) is outside the public address
// space, i.e. is a loopback, private, link-local, or other reserved address
// that a public deployment should never intend to test.
const isNonPublicIP = (address: string): boolean => {
  let parsed;
  try {
    // process(), rather than parse(), so an IPv4-mapped IPv6 address (e.g.
    // ::ffff:10.0.0.5) is unwrapped and classified by its embedded IPv4 address.
    parsed = ipaddr.process(address);
  }
  catch {
    // Not a recognizable IP address, so treat it as non-public, i.e. as unsafe.
    return true;
  }
  const ranges = parsed.kind() === 'ipv4' ? nonPublicIPv4Ranges : nonPublicIPv6Ranges;
  return ranges.has(parsed.range());
};
// Returns whether ALLOW_INTERNAL_TARGETS opts this deployment in to testing
// pages at private, loopback, or link-local addresses. A deployment that
// intentionally runs a Testaro worker inside a private network to test
// intranet pages sets this to "true"; a public deployment, whose Testaro
// workers may run on hosts with access to their own cloud metadata service,
// leaves it unset so private addresses are rejected by default (fail safe).
const allowsInternalTargets = (): boolean => process.env.ALLOW_INTERNAL_TARGETS === 'true';
// The signature of dns.lookup with {all: true}, extracted so tests can inject
// a fake resolver and avoid depending on real network/DNS access.
type LookupAll = (hostname: string, options: {all: true}) => Promise<{address: string; family: number}[]>;
// Returns whether the host a URL resolves to consists only of addresses this
// deployment is configured to allow as testing targets. This governs where
// the Testaro browser is allowed to navigate, so it is the control against
// submitting (or, via a redirect, being routed to) an unintended internal
// target such as a cloud metadata service or another host on a private
// network. It is deliberately independent of the syntax check that isURL
// performs, because it requires a DNS lookup, and therefore an internal
// deployment can use it to check both a requested URL (at submission time)
// and the actual, possibly redirected, URL of a report (at report-ingestion
// time). The lookup parameter defaults to the real dns.lookup and exists so
// tests can inject a fake resolver.
export const isAllowedTarget = async (url: string, lookup: LookupAll = dns.lookup): Promise<boolean> => {
  // If this deployment allows internal targets, every syntactically valid URL is allowed.
  if (allowsInternalTargets()) {
    return true;
  }
  let hostname: string;
  try {
    // URL.hostname keeps the surrounding brackets of a literal IPv6 host (e.g.
    // "[::1]"), which net.isIP and dns.lookup both reject, so they are stripped here.
    hostname = new URL(url).hostname.replace(/^\[(.*)\]$/, '$1');
  } catch {
    return false;
  }
  // If the hostname is itself a literal IP address, check it directly.
  if (net.isIP(hostname)) {
    return !isNonPublicIP(hostname);
  }
  // Otherwise, resolve the hostname and reject it if any address it resolves
  // to is non-public, since a hostname can resolve to more than one address
  // and an attacker need control only one of them.
  try {
    const addresses = await lookup(hostname, {all: true});
    return addresses.length > 0 && addresses.every(({address}) => !isNonPublicIP(address));
  } catch {
    // An unresolvable hostname cannot be a usable testing target either way.
    return false;
  }
};
// Returns whether a URL, when actually requested, resolves through any
// redirects to a final response whose URL is an allowed target. isAllowedTarget
// only resolves DNS, so it cannot see an application-layer redirect (e.g. a
// legitimately resolving host issuing a 302 to a private address); this
// check is what can catch that at request time, before a job is ever queued.
// It cannot catch a redirect introduced after it runs, e.g. an attacker who
// reconfigures the target host once a request is accepted, so isAllowedReport
// remains the backstop that re-checks the URL a worker actually visited.
export const isAllowedRedirectTarget = async (
  url: string, fetchImpl: typeof fetch = fetch, lookup: LookupAll = dns.lookup
): Promise<boolean> => {
  // If this deployment allows internal targets, every syntactically valid URL is
  // allowed, and no fetch is needed, consistent with isAllowedTarget's own early return.
  if (allowsInternalTargets()) {
    return true;
  }
  let response: Response;
  try {
    // redirect: 'follow' is the default, but named here because observing
    // where redirects lead is the entire purpose of this request.
    response = await fetchImpl(url, {redirect: 'follow', signal: AbortSignal.timeout(10000)});
  } catch {
    // An unreachable or errored target cannot be verified as safe either way.
    return false;
  }
  return isAllowedTarget(response.url, lookup);
};
// Returns whether a string is the authorization code, the shared check every
// manager-facing page and action uses to gate a submission. Centralized so all call
// sites compare against process.env.AUTH_CODE the same way.
export const isValidAuthCode = (authCode: string | undefined | null): boolean => {
  return !!authCode && authCode === process.env.AUTH_CODE;
};
// Minifies a URL for duplicate detection.
export const minifyURL = (url: string): string => url.replace(/www\.|\/$/g, '').toLowerCase();
// Sorts objects by a property value and returns the sorted array.
export const objectSort = <T extends Record<string, unknown>>(
  objects: T[],
  property: string,
  sortType: 'numericUp' | 'numericDown' | 'alpha'
): T[] => objects
.sort((a, b) => {
  // If the property values are numbers to be sorted in increasing order:
  if (sortType === 'numericUp') {
    // Sort by increasing numeric value.
    return Number(a[property]) - Number(b[property]);
  }
  // Otherwise, if they are numbers to be sorted in decreasing order:
  else if (sortType === 'numericDown') {
    // Sort by decreasing numeric value.
    return Number(b[property]) - Number(a[property]);
  }
  // Otherwise, if they are strings to be sorted alphabetically:
  else if (sortType === 'alpha') {
    // Sort alphabetically.
    return alphaCompare(String(a[property]), String(b[property]));
  }
  // Otherwise, do not sort.
  return 0;
});
// Concurrency lock for the `testRequests.json` file.
export const testRequestsLock = createLock();
// Deletes the test requests for a URL as a transaction.
export const deleteTestRequests = (url: string) => testRequestsLock(async (): Promise<void> => {
  // Get the test requests.
  const testRequests = await getTestRequests() as Record<string, unknown>;
  // Delete the requests to test the URL.
  delete testRequests[url];
  // Save the revised test requests.
  await fs.writeFile(testRequestsPath(), getJSON(testRequests));
});

// REPORT FUNCTIONS

// Returns the test acts of a report.
export const getTestActs = (report: UsableReport): AnnotatedAct[] =>
  report.acts.filter(act => act.type === 'test');
// Returns whether all URLs actually visited for a report are allowed targets.
// A URL submitted for testing can pass isAllowedTarget at submission time and
// still result in a report on a disallowed target, because the browser
// running in a worker can be redirected (possibly through DNS rebinding, so
// the same hostname resolves differently at fetch time) to a host this
// deployment does not allow as a testing target. Since each test act records
// the URL it actually visited (actualURL, defaulting to the requested URL of
// the job if a tool did not report one), checking every act here, right
// before a report is stored or served, is what actually closes that gap,
// independently of whatever happened during navigation.
export const isAllowedReport = async (
  report: Partial<Report>, lookup: LookupAll = dns.lookup
): Promise<boolean> => {
  const acts = Array.isArray(report.acts) ? report.acts : [];
  const testActs = acts.filter((act): act is AnnotatedAct => act?.type === 'test');
  const urlsVisited = new Set(
    testActs.map(act => act.actualURL ?? report.target?.url).filter((url): url is string => !!url)
  );
  for (const url of urlsVisited) {
    if (!(await isAllowedTarget(url, lookup))) {
      return false;
    }
  }
  return true;
};
// Returns the standard instances of a report's test acts, optionally filtered.
export const getTestActInstances = (
  report: UsableReport,
  filter: {violationsOnly?: boolean; issueID?: string; catalogIndex?: string | number} = {}
): {act: AnnotatedAct; instance: AnnotatedInstance}[] => {
  const pairs: {act: AnnotatedAct; instance: AnnotatedInstance}[] = [];
  // For each act of the report:
  for (const act of report.acts) {
    // If it is a test act:
    if (act.type === 'test') {
      // For each standard instance of its result:
      for (const instance of act.result?.standardResult?.instances ?? []) {
        if (
          (filter.violationsOnly && instance.outcome === 'cantTell')
          || (filter.issueID !== undefined && instance.issueID !== filter.issueID)
          || (filter.catalogIndex !== undefined && instance.catalogIndex !== filter.catalogIndex)
        ) {
          continue;
        }
        pairs.push({act, instance});
      }
    }
  }
  return pairs;
};
// Returns the path of an available report file.
export const getReportPath = (timeStamp: string, jobID: string): string => path
.join(reportsPath(), `${timeStamp}-${jobID}.json`);
// Returns whether a report is usable by Kilotest.
export const isUsableReport = (report: unknown): report is UsableReport => {
  // Cast to any for the property checks inside the guard — this is appropriate
  // for a type predicate that validates an unknown value at runtime.
  const r = report as any;
  // Return whether it has the type and properties required by Kilotest:
  return typeof r === 'object'
  && r !== null
  && typeof r.target?.what === 'string'
  && typeof r.target?.url === 'string'
  && Array.isArray(r.acts)
  && r.acts.every((act: any) =>
    typeof act === 'object'
    && typeof act.type === 'string'
    && act.type === 'test' ? Object.keys(ruleEngines).includes(act.which) : true
  )
  && typeof r.jobData === 'object'
  && r.jobData.endTime
  && !isNaN(getReportEndTime(r).getTime())
  && typeof r.catalog === 'object';
};
// Returns a report.
export const getReport = async (timeStamp: string, jobID: string): Promise<UsableReport | {error: string}> => {
  try {
    const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
    const report = JSON.parse(reportJSON);
    // If it is usable:
    if (isUsableReport(report)) {
      // Return it.
      return report;
    }
    // Otherwise, i.e. if it is unusable, return this.
    return {error: `Report ${timeStamp}-${jobID} is not usable`};
  } catch (error: unknown) {
    return {error: `Report ${timeStamp}-${jobID} is missing, unreadable, or not JSON (${errorMessage(error)})`};
  }
};
// Returns whether a getReport result is an error (rather than a usable report).
// A type predicate is used instead of `if (report.error)` because UsableReport
// inherits [key: string]: unknown from Report, making report.error type unknown
// and preventing TypeScript from narrowing based on truthiness.
export const isReportError = (r: UsableReport | {error: string}): r is {error: string} => {
  return typeof (r as any).error === 'string';
};
// Adds issue IDs to the standard instances of a report object, in place, and alerts a
// manager about any rules that could not be classified into an issue. Operates on an
// already-obtained report; a caller that has one only by identifier (e.g. one already
// stored) should read it with getReport first, while a caller that has a report object
// directly (e.g. one just received and not yet stored) can annotate it before ever
// writing it.
export const annotateReportObject = async (report: UsableReport): Promise<void> => {
  const unclassifiableRules = new Set<string>();
  // For each standard instance of each of its test acts (all outcomes, including cantTell —
  // classification maps rules to issues regardless of outcome):
  for (const {act, instance} of getTestActInstances(report)) {
    const {ruleID} = instance;
    // Classify its rule.
    const issueID = getIssue(act.which!, ruleID);
    // If the rule was classifiable:
    if (issueID) {
      // Add the issue ID to the instance.
      instance.issueID = issueID;
    }
    // Otherwise, i.e. if it was not classifiable:
    else {
      // Add it to the set of unclassifiable rules.
      unclassifiableRules.add(`${act.which!}:${ruleID}`);
      // Remove any existing issue ID from the instance.
      delete instance.issueID;
    }
  }
  const issuelessRules = Array.from(unclassifiableRules).sort();
  // Update the issueless rules in the report.
  report.jobData.issuelessRules = issuelessRules;
  // If any rules were unclassifiable:
  if (issuelessRules.length) {
    // Alert a manager about them.
    await sendAlert(
      'Kilotest: unclassified rules violated',
      `Report ${report.id}: Violated rules in no issues:\n${issuelessRules.join('\n')}`
    );
  }
};
// Returns the size of a report, or null if the report does not exist.
export const getReportStats = async (timeStamp: string, jobID: string) => {
  let reportStat;
  try {
    reportStat = await fs.stat(path.join(reportsPath(), `${timeStamp}-${jobID}.json`));
  }
  catch {
    return null;
  }
  const reportSize = reportStat.size;
  return {reportSize};
};
// Returns the completion time of a report. This, not the time stamp in the job ID nor the
// file system time of the report file, is the time of a report. The date is invalid if the
// report has no valid completion time.
export const getReportEndTime = (report: {jobData?: {endTime?: string}}): Date => new Date(
  `20${report.jobData?.endTime}Z`
);

// Returns an extract of an available report, or an error object if it cannot be read or parsed.
export const getReportExtract = async (timeStamp: string, jobID: string): Promise<ReportExtract | {error: string}> => {
  try {
    // Get the report.
    const reportJSON = await fs.readFile(
      path.join(reportsPath(), `${timeStamp}-${jobID}.json`), 'utf8'
    );
    const report = JSON.parse(reportJSON);
    const {target, jobData} = report;
    const {what: description, url} = target;
    // Return an extract of it.
    return {
      timeStamp,
      jobID,
      description,
      url,
      reportTime: getReportEndTime({jobData}).toISOString()
    };
  }
  catch {
    return {
      error: `No report ${timeStamp}-${jobID} is available`
    };
  }
};
// Cache of report extracts, keyed by report file path. Each entry records the modification
// time and size of the file when it was extracted, so an entry is reused only while the file
// is unchanged. Reports are mutable (e.g., reannotation rewrites all of them) and may be
// written, hidden, or deleted by any process, so the cache is validated against the files
// before every use rather than invalidated by the code that changes them.
const reportExtractCache = new Map<string, {mtimeMs: number, size: number, extract: ReportExtract}>();
// Returns extracts of all available reports.
export const getReportExtracts = async (onlyLatest: boolean = false): Promise<ReportExtract[]> => {
  const reportsDir = reportsPath();
  // Get the names and paths of the available report files.
  const reportFileNames = await readdirOrCreate(reportsDir, 'Reports directory');
  const reportFilePaths = reportFileNames.map(fileName => path.join(reportsDir, fileName));
  const reportFilePathSet = new Set(reportFilePaths);
  // Remove from the cache any report that is no longer available (e.g., hidden or deleted).
  for (const cachedPath of reportExtractCache.keys()) {
    if (!reportFilePathSet.has(cachedPath)) {
      reportExtractCache.delete(cachedPath);
    }
  }
  // Get the current modification times and sizes of the report files. A file that disappeared
  // after the directory was read gets values that match no cache entry, so it is reread, which
  // fails and removes it from the cache.
  const reportStats = await Promise.all(
    reportFilePaths.map(filePath => fs.stat(filePath).catch(() => ({mtimeMs: NaN, size: NaN})))
  );
  // Initialize an array of extracts.
  const extracts: ReportExtract[] = [];
  // For each report file:
  for (const [index, reportFileName] of reportFileNames.entries()) {
    const filePath = reportFilePaths[index]!;
    const stat = reportStats[index]!;
    const cached = reportExtractCache.get(filePath);
    // If its cached extract is current:
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      // Add a copy of the cached extract to the array.
      extracts.push({...cached.extract});
      continue;
    }
    // Otherwise, get a new extract of it. The stat precedes the read, so a change between
    // them leaves a stale modification time in the cache and causes a reread next time.
    const [timeStamp, jobID] = reportFileName.slice(0, -5).split('-') as [string, string];
    const extract = await getReportExtract(timeStamp, jobID);
    // If this succeeded:
    if (!('error' in extract)) {
      // Cache it and add a copy of it to the array.
      reportExtractCache.set(filePath, {mtimeMs: stat.mtimeMs, size: stat.size, extract});
      extracts.push({...extract});
    }
    // Otherwise, i.e. if it failed:
    else {
      // Forget any outdated extract of it.
      reportExtractCache.delete(filePath);
    }
  }
  // Sort the extracts by page description and, secondarily, completion time.
  objectSort(extracts, 'reportTime', 'alpha');
  objectSort(extracts, 'description', 'alpha');
  // For each extract:
  extracts.forEach((extract, index) => {
    // If it is superseded:
    if (extract.description === extracts[index + 1]?.description) {
      // Mark it as such.
      extract.superseded = true;
    }
  });
  // Return the array, excluding extracts of superseded reports if so specified.
  return onlyLatest ? extracts.filter(extract => !extract.superseded) : extracts;
};
// Returns whether a report with a description or URL is available.
export const isReportAvailable = async (description: string, url: string): Promise<boolean> => {
  const reportExtracts = await getReportExtracts();
  const descriptions = reportExtracts.map(reportExtract => reportExtract.description);
  const miniURLs = reportExtracts.map(reportExtract => minifyURL(reportExtract.url));
  return descriptions.includes(description) || miniURLs.includes(minifyURL(url));
};
// Returns the property that an approved job in a category has.
const getApprovedJobProperty = async (
  description: string, url: string, category: 'claimed' | 'queue'
): Promise<'description' | 'url' | ''> => {
  try {
    // Get the descriptions and URLs of all jobs in the category.
    const jobsData = await getJobsData(category);
    // If a job with the description is in the category:
    if (jobsData.some(job => job.description === description)) {
      // Return this.
      return 'description';
    }
    // Otherwise, if a job with an equivalent URL is in the category:
    const miniURL = minifyURL(url);
    if (jobsData.some(job => minifyURL(job.url) === miniURL)) {
      // Return this.
      return 'url';
    }
    // Otherwise, return this.
    return '';
  }
  catch(error) {
    throw new Error('Failed to get approved job property', {cause: error});
  }
};
// Processes a new-test or retest request as a transaction and returns the result.
// For a retest request (target has a timeStamp and jobID), resolves the description
// and URL of the cited report itself, so a caller never needs its own
// getReportExtract call. Approvability (whether the request may proceed) and, if so,
// its addition to testRequests.json are both decided inside the lock, as a single
// atomic operation, so no caller-visible seam exists where an approvability decision
// could be based on stale information about testRequests.json.
// Returns the non-negative-integer value of an environment variable, or a default if the
// variable is unset, empty, or not a non-negative integer. Read at call time, not cached,
// so a variable set (e.g. in .env) after this module first loads still takes effect. Used
// by the "inbox full" caps below (test requests, tutorial comments, feature requests),
// which different Kilotest deployments' maintainers may reasonably want sized differently.
// A value of 0 means no limit, mirroring how these caps are checked (never reached).
export const getEnvMax = (name: string, defaultValue: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
};
// Maximum number of test/retest requests awaiting approval at once, across all URLs.
// Once reached, a new, distinct request is rejected rather than added, so the pending
// queue and the manager alert emails it generates cannot grow without bound (see GitHub
// issue #3, abuse type 3, repeated/automated test-request submissions). Modeled on a full
// mailbox rejecting new mail, rather than on a submission rate limit, since it is the
// backlog itself, not how quickly it grows, that costs the manager review time and risks
// unbounded storage. Configurable via TEST_REQUEST_QUEUE_MAX, since different Kilotest
// deployments' maintainers may want a different size; a value of 0 means no limit.
const testRequestQueueMax = () => getEnvMax('TEST_REQUEST_QUEUE_MAX', 20);
// Returns a cap for display in an alert message: the cap itself, or "no limit" if the
// cap is 0.
export const describeMax = (max: number): string => max === 0 ? 'no limit' : String(max);
// Returns the total number of test/retest requests awaiting approval, across all URLs.
const getPendingTestRequestCount = (testRequests: TestRequests): number =>
  Object.values(testRequests).reduce((total, requests) => total + requests.length, 0);
export const processTestRequest = (
  reason: string,
  target: TestRequestTarget
): Promise<ProcessRequestResult> => testRequestsLock(async (): Promise<ProcessRequestResult> => {
  let requestType: 'newTest' | 'retest';
  let description: string;
  let url: string;
  // Whether the cited report (for a retest) has been superseded by a later one.
  let superseded = false;
  // If the target identifies a report to retest:
  if ('timeStamp' in target) {
    requestType = 'retest';
    const {timeStamp, jobID} = target;
    // Get the cited report.
    const extract = await getReportExtract(timeStamp, jobID);
    // If it does not exist:
    if ('error' in extract) {
      // Return this.
      return {result: 'nonreport'};
    }
    ({description, url} = extract);
    // Get whether it has been superseded by a later report.
    const reportExtracts = await getReportExtracts();
    superseded = reportExtracts.some(
      ex => ex.timeStamp === timeStamp && ex.jobID === jobID && ex.superseded
    );
  }
  // Otherwise, i.e. if the target is a page to test for the first time:
  else {
    requestType = 'newTest';
    ({description, url} = target);
  }
  try {
    // Get any property the page shares with a claimed job.
    const claimedJobProperty = await getApprovedJobProperty(description, url, 'claimed');
    // Get any property the page shares with a queued job.
    const queueJobProperty = await getApprovedJobProperty(description, url, 'queue');
    // If the page shares a property with a claimed or queued job:
    if (claimedJobProperty || queueJobProperty) {
      // Return the property.
      return {
        result: (claimedJobProperty || queueJobProperty) as 'description' | 'url',
        description,
        url
      };
    }
    // Otherwise, get the requests awaiting approval.
    const requests = await getTestRequests() as Record<string, {
      description: string, reason: string, timeStamp: string
    }[]>;
    // If the request has the same URL, description and reason as an existing request:
    if (requests[url]?.some(
      request => request.description === description && request.reason === reason
    )) {
      // Return this.
      return {result: 'duplicate', description, url};
    }
    // If the request is to retest a page that has been superseded:
    if (requestType === 'retest' && superseded) {
      // Return this.
      return {result: 'superseded', description, url};
    }
    // Otherwise, if the request is to test a new page and a report already exists about a
    // page with the same description or URL:
    if (requestType === 'newTest' && await isReportAvailable(description, url)) {
      // Return this.
      return {result: 'reportExists', description, url};
    }
    // Otherwise, i.e. if the request is genuinely new, if the queue of requests awaiting
    // approval is already full (a cap of 0 means no limit, so the queue is never full):
    const queueMax = testRequestQueueMax();
    if (queueMax > 0 && getPendingTestRequestCount(requests) >= queueMax) {
      // Return this.
      return {result: 'queueFull', description, url};
    }
    // The request is eligible, so get the requests awaiting approval.
    const testRequests = await getTestRequests();
    // Add the request to them, initializing them with the URL if necessary.
    (testRequests[url] ??= []).push({
      timeStamp: getNowStamp(),
      description,
      reason
    });
    // Save the revised test requests.
    await fs.writeFile(testRequestsPath(), getJSON(testRequests));
    // Get an email-safe version of the reason.
    const plainReason = getPlainText(reason);
    // Alert a manager, including the resulting queue size, so a maintainer who has been
    // away sees at a glance how urgently the queue needs review (approval or rejection)
    // rather than learning this only once it is already full.
    const requestTypeLabel = requestType === 'newTest' ? 'a new test' : 'a retest';
    await sendAlert(
      `Kilotest: request for ${requestTypeLabel} awaits approval`,
      `Page description: ${description}\nURL: ${url}\nReason: ${plainReason}\n` +
      `Requests now awaiting approval: ${getPendingTestRequestCount(testRequests)} of ${describeMax(queueMax)}`
    );
    // Return success.
    return {result: 'ok', description, url};
    // If an error occurred:
  } catch(error) {
    // Throw it.
    throw new Error('Failed to process test request', {cause: error});
  }
});
// Maximum number of jobs allowed in the job queue (db/jobs/queue) at once. This queue is
// shared by every path that enqueues a job: manual approval of a pending test/retest
// request (web/enqueue), and any tool (such as orderNewTest) that enqueues directly. The cap
// therefore protects the queue itself, not any one source of jobs; a value of 0 means no
// limit. Configurable via JOB_QUEUE_MAX.
const jobQueueMax = () => getEnvMax('JOB_QUEUE_MAX', 20);
// Result of orderJob. description and url are absent only when the result is
// 'nonreport' (a retest order citing a report that does not exist), matching
// ProcessRequestResult's own discriminated-union shape. There is no pending approval
// inbox to compare against, so 'duplicate' (an identical pending request) never applies.
// jobID (the enqueued job's own identifier, timeStamp-jobID) is present only on 'ok'.
export type OrderJobResult
= {result: 'nonreport'}
| {result: 'ok'; description: string; url: string; jobID: string}
| {result: Exclude<TestRequestResult, 'nonreport' | 'duplicate' | 'ok'>; description: string; url: string};
// Orders a test or retest as a transaction: validates the target is not already queued,
// claimed, or (for a new-page order) reported, then enqueues a job directly into
// db/jobs/queue, bypassing the pending-approval inbox (testRequests.json) that
// processTestRequest writes to. This is the auto-approval GitHub issue #111 asks for: a
// lightweight gate (the same claimed/queued dedup check processTestRequest already
// performs, plus a cap on the queue itself) substitutes for a maintainer's manual
// review. Runs under testRequestsLock, the same lock processTestRequest uses, so an
// orderJob call and a processTestRequest call can never race to enqueue duplicate jobs
// for the same page. The caller's stated reason is recorded on the job (sources.reason),
// which survives into the eventual report exactly as sources.worker already does: no
// approval rule consults it yet, but accumulating real callers' stated reasons is
// intended to inform the design of more sophisticated, reason-aware approval rules in a
// later iteration.
export const orderJob = (
  target: TestRequestTarget, reason: string
): Promise<OrderJobResult> => testRequestsLock(async (): Promise<OrderJobResult> => {
  let description: string;
  let url: string;
  // Whether the cited report (for a retest order) has been superseded by a later one.
  let superseded = false;
  // If the target identifies a report to retest:
  if ('timeStamp' in target) {
    const {timeStamp, jobID} = target;
    // Get the cited report.
    const extract = await getReportExtract(timeStamp, jobID);
    // If it does not exist:
    if ('error' in extract) {
      // Return this.
      return {result: 'nonreport'};
    }
    ({description, url} = extract);
    // Get whether it has been superseded by a later report.
    const reportExtracts = await getReportExtracts();
    superseded = reportExtracts.some(
      ex => ex.timeStamp === timeStamp && ex.jobID === jobID && ex.superseded
    );
  }
  // Otherwise, i.e. if the target is a page to test for the first time:
  else {
    ({description, url} = target);
  }
  try {
    // Get any property the page shares with a claimed job.
    const claimedJobProperty = await getApprovedJobProperty(description, url, 'claimed');
    // Get any property the page shares with a queued job.
    const queueJobProperty = await getApprovedJobProperty(description, url, 'queue');
    // If the page shares a property with a claimed or queued job:
    if (claimedJobProperty || queueJobProperty) {
      // Return the property.
      return {
        result: (claimedJobProperty || queueJobProperty) as 'description' | 'url',
        description,
        url
      };
    }
    // Otherwise, if the order is to retest a page that has been superseded:
    if ('timeStamp' in target && superseded) {
      // Return this.
      return {result: 'superseded', description, url};
    }
    // Otherwise, if the order is to test a new page and a report already exists about a
    // page with the same description or URL:
    if (!('timeStamp' in target) && await isReportAvailable(description, url)) {
      // Return this.
      return {result: 'reportExists', description, url};
    }
    // Otherwise, if the job queue is already full (a cap of 0 means no limit, so the
    // queue is never full):
    const queueMax = jobQueueMax();
    const {queue: queuedJobNames} = await getJobNames();
    if (queueMax > 0 && queuedJobNames.length >= queueMax) {
      // Return this.
      return {result: 'queueFull', description, url};
    }
    // The page is eligible, so build a job from the template.
    const jobTemplateJSON = await fs.readFile(path.join(import.meta.dirname, 'job.json'), 'utf8');
    const job = JSON.parse(jobTemplateJSON);
    const nowStamp = getNowStamp();
    const jobIDSuffix = getRandomString(3);
    const jobName = `${nowStamp}-${jobIDSuffix}`;
    job.id = jobName;
    job.creationTimeStamp = nowStamp;
    job.executionTimeStamp = nowStamp;
    job.target.what = description;
    job.target.url = url;
    job.sources.reason = reason;
    // Save the job in the queue.
    await fs.writeFile(path.join(jobsPath(), 'queue', `${jobName}.json`), getJSON(job));
    console.log(`Test ordered for ${description} as job ${jobName}`);
    // Return success, with the job identifier so the caller can report it.
    return {result: 'ok', description, url, jobID: jobName};
    // If an error occurred:
  } catch(error) {
    // Throw it.
    throw new Error('Failed to order test', {cause: error});
  }
});
// Milliseconds between polls in awaitJob, and the maximum total milliseconds awaitJob
// waits before giving up. Both are read at call time (not cached), via environment
// variables, so tests can shrink them well below the real ~2-to-4-minute wait a
// production caller experiences; AWAIT_JOB_TIMEOUT_MS deliberately exceeds the
// documented "occasionally up to 4 minutes" a caller is told to expect, leaving margin
// so a job that is genuinely still running is not mistaken for one that never will
// finish.
const awaitJobPollMs = () => getEnvMax('AWAIT_JOB_POLL_MS', 2000);
const awaitJobTimeoutMs = () => getEnvMax('AWAIT_JOB_TIMEOUT_MS', 5 * 60 * 1000);
// Result of awaitJob.
export type AwaitJobResult = 'completed' | 'failed' | 'timedOut' | 'notFound';
// Waits for a job ordered via orderJob (or, in principle, any job in db/jobs/queue or
// db/jobs/claimed identified the same way) to leave the queue/claimed pipeline, by
// polling for the outcome Kilotest already records for it: a completed report at
// timeStamp-jobID.json (see index.ts's worker/report handler, which is the sole writer
// of that file), or the job's own file having moved to db/jobs/failed (see
// index.ts's processJobRequest and worker/report handler, which are the only
// code that reclassifies a job as failed). Returns 'notFound' immediately, without
// polling, if the identifier names neither a completed report nor a job anywhere in the
// queue/claimed/failed pipeline, since there is then nothing to wait for. No progress
// notifications are emitted during the wait; this is a pure bounded poll.
export const awaitJob = async (timeStamp: string, jobID: string): Promise<AwaitJobResult> => {
  const jobFileName = `${timeStamp}-${jobID}.json`;
  const pollMs = awaitJobPollMs();
  const timeoutMs = awaitJobTimeoutMs();
  const deadline = Date.now() + timeoutMs;
  // Returns the job's outcome if it is now determinable, or null if it is still pending.
  const checkOutcome = async (): Promise<AwaitJobResult | null> => {
    if (await getReportStats(timeStamp, jobID)) {
      return 'completed';
    }
    const jobNames = await getJobNames();
    if (jobNames.failed.includes(jobFileName)) {
      return 'failed';
    }
    if (jobNames.queue.includes(jobFileName) || jobNames.claimed.includes(jobFileName)) {
      return null;
    }
    // The identifier names neither a report nor a job anywhere in the pipeline.
    return 'notFound';
  };
  // If the job is not yet determinable, poll until it is or the deadline passes.
  let outcome = await checkOutcome();
  while (outcome === null && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    outcome = await checkOutcome();
  }
  return outcome ?? 'timedOut';
};

// METRICS FUNCTIONS

// Name of the cookie that excludes a browser's requests from usage metrics.
export const metricsExclusionCookieName = 'kilotestExclude';
// Returns the value that the metrics-exclusion cookie must have to be honored: a SHA-256
// hash of AUTH_CODE, not AUTH_CODE itself, so the secret is never placed in a long-lived
// browser cookie, and not a fixed value, since Kilotest's source is public and a fixed
// value would let anyone read it and exclude themselves from metrics at no cost.
export const getExclusionCookieValue = (): string =>
  crypto.createHash('sha256').update(process.env.AUTH_CODE ?? '').digest('hex');
// Concurrency lock for the `metrics.json` file.
const metricsLock = createLock();
// Returns the usage metrics, creating the file with zeroed counts if it does not yet exist.
export const getMetrics = async (): Promise<Metrics> => {
  let metricsJSON: string;
  try {
    metricsJSON = await fs.readFile(metricsPath(), 'utf8');
  }
  catch(error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const metrics: Metrics = {
        since: getNowStamp(), pageViews: {}, mcpToolCalls: {}, apiOperations: {}, managerActivity: {}
      };
      await fs.writeFile(metricsPath(), getJSON(metrics));
      return metrics;
    }
    throw new Error(`Metrics file not readable (${errorMessage(error)})`, {cause: error});
  }
  let metrics: Partial<Metrics>;
  try {
    metrics = JSON.parse(metricsJSON) as Partial<Metrics>;
  }
  catch(error: unknown) {
    throw new Error(`Metrics file not JSON (${errorMessage(error)})`, {cause: error});
  }
  // Backfill any category absent from a file written before that category existed,
  // so an older metrics.json (e.g. from before a schema change) remains readable.
  return {
    since: metrics.since ?? getNowStamp(),
    pageViews: metrics.pageViews ?? {},
    mcpToolCalls: metrics.mcpToolCalls ?? {},
    apiOperations: metrics.apiOperations ?? {},
    managerActivity: metrics.managerActivity ?? {}
  };
};
// Records an occurrence of a named event (a web page view, an MCP tool call, or an API
// operation call) in the usage metrics, creating the category and name if not yet present.
export function recordMetric(
  category: 'pageViews' | 'mcpToolCalls' | 'apiOperations', name: string
): Promise<void>;
// Records an outcome of a manager-page visit or submission (a distinct category from
// pageViews, so a spike in failed authCode attempts against a manager page is visible
// as a signal of suspected abuse, rather than being folded into ordinary page views).
export function recordMetric(
  category: 'managerActivity', name: string, outcome: 'ok' | 'error'
): Promise<void>;
export function recordMetric(
  category: 'pageViews' | 'mcpToolCalls' | 'apiOperations' | 'managerActivity',
  name: string,
  outcome?: 'ok' | 'error'
): Promise<void> {
  return metricsLock(async (): Promise<void> => {
    const metrics = await getMetrics();
    if (category === 'managerActivity') {
      const entry = metrics.managerActivity[name] ??= {ok: 0, error: 0};
      entry[outcome!]++;
    }
    else {
      metrics[category][name] = (metrics[category][name] ?? 0) + 1;
    }
    await fs.writeFile(metricsPath(), getJSON(metrics));
  });
}
// Resets all usage metrics to empty and since to now.
export const clearMetrics = (): Promise<Metrics> => metricsLock(async (): Promise<Metrics> => {
  const metrics: Metrics = {
    since: getNowStamp(), pageViews: {}, mcpToolCalls: {}, apiOperations: {}, managerActivity: {}
  };
  await fs.writeFile(metricsPath(), getJSON(metrics));
  return metrics;
});
