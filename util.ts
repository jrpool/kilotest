/*
  util.ts
  Utility functions.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {sendAlert} from './alerts.ts';
import {issues as issueSpecs, rules as ruleSpecs} from 'testaro-issues';
import type {Act, Catalog, Report, StandardInstance} from 'testaro';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import querystring from 'node:querystring';
/* c8 ignore stop */
import wcagMap from './wcagMap.json' with {type: 'json'};

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

// Test request addition result.
export type TestRequestResult
= 'url' | 'description' | 'retest' | 'duplicate' | 'superseded' | 'nonreport' | 'ok';

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

// Page data from an available report.
export type PageData = {
  description: string;
  url: string;
  daysAgo: number | null;
  error?: never;
};

// HTML strings describing the page data of an available report.
export type PageDataStrings = {
  description: string;
  url: string;
  urlLink: string;
  testInfo: string;
  error?: never;
};

// Basics about an available report.
export type ReportData = {
  description: string;
  url: string;
  jobName: unknown;
  creationDate: Date | null;
  daysAgo: number | null;
  issueCount: number;
  engineNames: string[];
  engineCount: number;
  reporterNames: string[];
  reporterCount: number;
  violatorCount: number;
  preventedEngineNames: string[];
  preventedEngineCount: number;
  error?: never;
};

// MISCELLANEOUS FUNCTIONS

// Compares strings alphabetically and case-insensitively.
const alphaCompare = (a: string, b: string) => a.localeCompare(b, 'en', {sensitivity: 'base'});
// Sorts strings alphabetically and case-insensitively.
const alphaSort = (strings: string[]) => strings.sort((a, b) => alphaCompare(a, b));
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
// Returns whether a comment's raw length is within the 20-to-1000-character bounds.
export const checkCommentLength = (
  content: string
): {status: 'ok'} | {status: 'error'; message: string} => {
  const contentLength = content.length;
  // If the length is invalid:
  if (contentLength < 20 || contentLength > 1000) {
    // Return the applicable error message.
    const messageSpec = contentLength < 20 ? 'shorter than 20' : 'longer than 1000';
    return {
      status: 'error',
      message: `Your comment was ${messageSpec} characters`
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
// Returns a string encoded for use as a URL fragment.
const fragmentEncode = (string: string) => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
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
// Returns a string describing the time in days since a time stamp.
export const getAgoString = (timeStamp: string): string => {
  const agoDays = getAgoDays(timeStamp);
  if (agoDays === null) {
    return 'an unknown number of days';
  }
  return agoDays === 1 ? '1 day' : `${agoDays} days`;
};
// Returns a string describing a count.
export const getCountString = (count: number, singular: string, plural: string): string => count === 1 ? `1 ${singular}` : `${count} ${plural}`;
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
// Returns a time string from a time stamp.
const getTimeString = (timeStamp: string) => {
  const timeString = `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
  // Return the time string if valid, or null if not.
  return (!isNaN(Date.parse(`2000-01-01T${timeString}Z`))) ? timeString : null;
};
// Returns a date-and-time string.
export const getDateTimeString = (timeStamp: string): string => {
  const dateString = getDateString(timeStamp) || 'an unknown date';
  const timeString = getTimeString(timeStamp) || 'an unknown time';
  const dateTimeString = `${dateString} at ${timeString}`;
  return dateTimeString;
}
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
// Converts a catalog item text to a text-fragment link destination.
export const getTextFragmentHref = (text: string, url: string): string => {
  const fragmentList = text
  .split('\n')
  .map(fragment => fragmentEncode(fragment))
  .join(',');
  // Return a text-fragment link.
  return `${url}#:~:text=${fragmentList}`;
};
// Returns a +-delimited list of sorted names of rule engines.
export const getEngineNamesString = (engineIDSet: Iterable<string>): string => alphaSort(
  Array.from(engineIDSet).map(engineID => ruleEngines[engineID]?.[0] || engineID)
).join(' + ');
// Gets the WCAG Understanding link for a numeric WCAG standard identifier.
export const getWCAGLink = (numericID: string): string => {
  // Return the link.
  return `https://www.w3.org/WAI/WCAG22/Understanding/${(wcagMap as Record<string, string>)[numericID]}`;
};
// Gets the name of an issue weight.
export const getWeightName = (weight: number): string => ['lowest', 'low', 'high', 'highest'][weight - 1] ?? 'unknown';
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
// Returns whether an IPv4 address (in dotted-decimal form) is in a private,
// loopback, link-local, or otherwise non-public range, including the
// 169.254.169.254 cloud-metadata address (which falls under link-local).
const isNonPublicIPv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number);
  const [a, b = 0] = octets;
  return (
    a === 127 || // loopback
    a === 10 || // private
    a === 0 || // "this network"
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  );
};
// Returns whether an IPv6 address is in a loopback, unique-local, or
// link-local range.
const isNonPublicIPv6 = (address: string): boolean => {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' // loopback
    || normalized === '::' // unspecified
    || /^::ffff:/.test(normalized) && isNonPublicIPv4(normalized.replace(/^::ffff:/, '')) // IPv4-mapped
    || /^f[cd][0-9a-f]{2}:/.test(normalized) // unique local (fc00::/7)
    || /^fe[89ab][0-9a-f]:/.test(normalized) // link-local (fe80::/10)
  );
};
// Returns whether an IP address (v4 or v6) is outside the public address
// space, i.e. is a loopback, private, link-local, or other reserved address
// that a public deployment should never intend to test.
const isNonPublicIP = (address: string): boolean => {
  const version = net.isIP(address);
  if (version === 4) {
    return isNonPublicIPv4(address);
  }
  if (version === 6) {
    return isNonPublicIPv6(address);
  }
  // Not a recognizable IP address, so treat it as non-public, i.e. as unsafe.
  return true;
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
    hostname = new URL(url).hostname;
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
// Returns whether a string is the authorization code, the shared check every
// manager-facing page and action uses to gate a submission. Centralized so all call
// sites compare against process.env.AUTH_CODE the same way.
export const isValidAuthCode = (authCode: string | undefined | null): boolean => {
  return !!authCode && authCode === process.env.AUTH_CODE;
};
// Makes a string breakable before non-initial slashes.
export const makeBreakable = (string: string): string => string.replace(/\//g, '<wbr>/').replace(/^<wbr>/, '');
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
// Returns the path ID of the element of a standard instance.
export const getPathID = (catalog: Catalog, catalogIndex: string, pathID?: string) => {
  if (catalogIndex) {
    const pathIDFromCatalog = (catalog[catalogIndex] || {}).pathID;
    if (pathIDFromCatalog) {
      return pathIDFromCatalog;
    }
  }
  return pathID ?? '/html';
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
  && !isNaN(new Date(`20${r.jobData.endTime}Z`).getTime())
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
// Returns basics about an available report.
export const getReportData = async (timeStamp: string, jobID: string): Promise<ReportData | {error: string}> => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (isReportError(report)) {
    // Return why.
    return {error: report.error};
  }
  // Otherwise, i.e. if it succeeded, initialize the data.
  const data = {
    description: report.target.what,
    url: report.target.url,
    jobName: report.id,
    creationDate: getDateTime(timeStamp),
    daysAgo: getAgoDays(timeStamp),
    issueCount: 0,
    engineNames: [] as string[],
    engineCount: 0,
    reporterNames: [] as string[],
    reporterCount: 0,
    violatorCount: 0,
    preventedEngineNames: [] as string[],
    preventedEngineCount: 0
  };
  const issueIDSet = new Set<string>();
  const engineNameSet = new Set<string>();
  const reporterIDSet = new Set<string>();
  const violatorIndexSet = new Set<string>();
  // For each test act of the report:
  getTestActs(report).forEach(act => {
    // Ensure that the rule engine is in the temporary data.
    engineNameSet.add(ruleEngines[act.which!]![0]);
  });
  // For each violating standard instance of each test act:
  getTestActInstances(report, {violationsOnly: true}).forEach(({act, instance}) => {
    const {catalogIndex, issueID} = instance;
    // If it has a non-ignorable classified issue ID:
    if (issueID && issueSpecs[issueID] && issueID !== 'ignorable') {
      // Ensure that the rule engine is in the temporary data.
      reporterIDSet.add(act.which!);
      // Ensure that the issue is in the temporary data.
      issueIDSet.add(issueID);
      // If the violator has a catalog index:
      if (catalogIndex) {
        // Ensure that the violator is in the temporary data.
        violatorIndexSet.add(String(catalogIndex));
      }
    }
  });
  // Populate the data with the act data.
  data.issueCount = issueIDSet.size;
  data.engineNames = Array
  .from(engineNameSet)
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.engineCount = engineNameSet.size;
  data.reporterNames = Array
  .from(reporterIDSet)
  .map(id => ruleEngines[id]![0])
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.reporterCount = data.reporterNames.length;
  data.violatorCount = violatorIndexSet.size;
  // Add the names of any prevented rule engines to the data.
  data.preventedEngineNames = Object.keys(report.jobData?.preventions || {})
  .map(engineID => ruleEngines[engineID]?.[0] || engineID)
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.preventedEngineCount = data.preventedEngineNames.length;
  // Return the data.
  return data;
}
// Returns page data from an available report.
export const getPageData = async (timeStamp: string, jobID: string): Promise<PageData | {error: string}> => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (isReportError(report)) {
    // Return why.
    return report;
  }
  const {what: description, url} = report.target;
  // Get the elapsed time in days since the report was completed, using the
  // report content rather than the file system birth time.
  const daysAgo = getAgoDays(new Date(`20${report.jobData.endTime}Z`));
  // Return the data.
  return {
    description,
    url,
    daysAgo
  };
};
// Gets HTML strings for page data from a report.
export const getPageDataStrings = async (
  timeStamp: string,
  jobID: string,
  pageData?: PageData | {error: string}
): Promise<PageDataStrings | {error: string}> => {
  // Get the page data if they were not specified.
  const data = pageData ?? await getPageData(timeStamp, jobID);
  // If the page data are invalid:
  if (data.error !== undefined) {
    // Return why.
    return {
      error: data.error
    };
  }
  const {daysAgo, url, description} = data;
  // Otherwise, i.e. if they are valid, get a description of the timestamp.
  const when = getDateTimeString(timeStamp);
  // Return the HTML strings.
  return {
    description,
    url,
    urlLink: `<a href="${url}">${url}</a>`,
    testInfo: `Tested ${daysAgo === 1 ? '1 day' : `${daysAgo} days`} ago by job <code>${jobID}</code> on ${when}`
  };
};
// Returns the creation time and size of a report.
export const getReportStats = async (timeStamp: string, jobID: string) => {
  let reportStat;
  try {
    reportStat = await fs.stat(path.join(reportsPath(), `${timeStamp}-${jobID}.json`));
  }
  catch {
    return null;
  }
  const reportTime = reportStat.birthtime;
  const reportSize = reportStat.size;
  return {reportTime, reportSize};
};

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
      reportTime: new Date(`20${jobData.endTime}Z`).toISOString()
    };
  }
  catch {
    return {
      error: `No report ${timeStamp}-${jobID} is available`
    };
  }
};
// Returns extracts of all available reports.
export const getReportExtracts = async (onlyLatest: boolean = false): Promise<ReportExtract[]> => {
  // Get the names of the available report files.
  const reportFileNames = await readdirOrCreate(reportsPath(), 'Reports directory');
  // Initialize an array of extracts.
  const extracts: ReportExtract[] = [];
  // For each one:
  for (const reportFileName of reportFileNames) {
    const [timeStamp, jobID] = reportFileName.slice(0, -5).split('-') as [string, string];
    // Get an extract of it.
    const extract = await getReportExtract(timeStamp, jobID);
    if (!('error' in extract)) {
      // Add the extract to the array.
      extracts.push(extract);
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
// Gets the descriptions of multi-report pages.
export const getMultiReportWhats = async (): Promise<string[]> => {
  const reportExtracts = await getReportExtracts();
  const sortedDescriptions = reportExtracts.map(extract => extract.description).sort();
  const multiReportDescriptions = sortedDescriptions.filter(
    (description, index) => description !== sortedDescriptions[index - 1] && description === sortedDescriptions[index + 1]
  );
  return multiReportDescriptions;
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
    // Otherwise, if a job with the URL is in the category:
    if (jobsData.some(job => job.url === url)) {
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
export const processTestRequest = (
  reason: string,
  target: TestRequestTarget
): Promise<ProcessRequestResult> => testRequestsLock(async (): Promise<ProcessRequestResult> => {
  let requestType: 'test' | 'retest';
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
    requestType = 'test';
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
    // Otherwise, if the request is to test a new page for which a report already exists:
    if (requestType === 'test') {
      const reportExtracts = await getReportExtracts();
      if (reportExtracts.some(report => report.description === description && report.url === url)) {
        // Return this.
        return {result: 'retest', description, url};
      }
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
    // Alert a manager.
    await sendAlert(
      `Kilotest: new ${requestType} request awaits approval`,
      `Page description: ${description}\nURL: ${url}\nReason: ${plainReason}`
    );
    // Return success.
    return {result: 'ok', description, url};
    // If an error occurred:
  } catch(error) {
    // Throw it.
    throw new Error('Failed to process test request', {cause: error});
  }
});

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
