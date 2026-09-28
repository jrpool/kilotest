/*
  util.ts
  Utilities for API requests.
*/

// IMPORTS

import {
  getAgoDays,
  getReportExtracts,
  getNowStamp,
  getRandomString,
  getReportExtract,
  getReportStats,
  objectSort,
  ruleEngines
} from '../util.ts';
import type {ReportExtract, TestRequestResult} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// TYPES

// The basics about a report, as returned by getReportBasics.
export type ReportBasics = {
  identifier: string;
  'completion date and time': string;
  'days since the report was completed': number | null;
  'tested web page': {description: string; URL: string};
  'whether a later report about the same page exists': boolean;
};

// The disposition of a test/retest/instant-test request, as returned by
// buildRequestDisposition, or null when the request itself was invalid (in which case
// details about your request already carries the error, and no disposition applies).
export type RequestDisposition = {
  'what happens next': string;
  'how you can check for completion': string;
  'how a web user can check for completion': string;
} | null;

// FUNCTIONS

// Returns the base URL of this Kilotest host.
export const getThisHost = () => process.env.THIS_KILOTEST_HOST;
// Returns uniform metadata for every response.
export const getResponseMetadata = () => ({
  identifier: `${getNowStamp()}-${getRandomString(3)}`,
  'date and time': new Date().toISOString()
});
// Returns facts about the tool collection (Kilotest).
export const getToolsFacts = () => ({
  'name': 'Kilotest',
  'description': {
    'what Kilotest does': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against about 1300 rules defined by an ensemble of twelve rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to enhance the report with a classification of the rule violations into about 380 issues. Kilotest makes facts about the issues and the violations retrievable at four levels of granularity.',
    'how to retrieve findings': {
      'level 1': 'Use the listReports tool to get a list of available reports.',
      'level 2': 'Use the listIssues tool to get a list of issues in one report.',
      'level 3': 'Use the listViolators tool to get a list of elements on one page that were reported in one report as exhibiting one issue.',
      'level 4': 'Use the listDiagnoses tool to get a list of diagnoses of how one element on one page exhibited one issue in one report.',
    },
    'how to generate more findings': {
      'new testing': 'If no report is available yet about a page, use the requestTest tool to request that it be tested.',
      'retesting': 'If the listIssues tool shows that the latest report about a page is obsolete, because the page has been revised or for another reason, use the requestRetest tool to request that the page be retested.',
      'latency': 'Requests for testing and retesting are usually approved and fulfilled within one day.',
      'confirmation': 'Use the listReports tool to determine whether a requested new report exists. There is currently no process for notification of the outcome of requests.'
    }
  },
  'URL': `${getThisHost()}/mcp`,
  'web users can obtain similar functionalities at': getThisHost()
});
// Returns the human-readable reason a test/retest/instant-test request was not
// processed, given the result processTestRequest returned. requestResult is always a
// rejection reason here ('description', 'url', 'queueFull', or an unrecognized value
// meaning 'duplicate'); callers pass their own extra branch for a requestResult value
// specific to their own request type ('retest' for requestTest, 'superseded' for
// requestRetest), since that is the one branch not shared between them.
export const getRequestFailureReason = (
  requestResult: Exclude<TestRequestResult, 'ok'>,
  extraBranch?: {result: TestRequestResult; reason: string}
): string => {
  if (requestResult === 'description') {
    return 'a request to test a page with the same description is already approved.';
  }
  if (requestResult === 'url') {
    return 'a request to test a page with the same URL is already approved.';
  }
  if (extraBranch && requestResult === extraBranch.result) {
    return extraBranch.reason;
  }
  if (requestResult === 'queueFull') {
    return 'too many requests are awaiting approval right now. Please try again later, ' +
      'or post your request at https://github.com/jrpool/kilotest/issues or email info@kilotest.com.';
  }
  return 'an identical request is already awaiting approval.';
};
// Returns the disposition of a test/retest/instant-test request: an 'ok' disposition
// describing how to check for completion, or a rejection disposition naming why the
// request was not processed. Shared by requestTest, requestRetest, and orderTest,
// whose only differences are the wording of the 3 completion-related sentences and, for
// a rejection, the one extra requestResult branch getRequestFailureReason takes.
export const buildRequestDisposition = (
  requestResult: TestRequestResult,
  okText: {whatHappensNext: string; howToCheck: string; howWebUserChecks: string},
  extraBranch?: {result: TestRequestResult; reason: string}
): RequestDisposition => {
  if (requestResult === 'ok') {
    return {
      'what happens next': okText.whatHappensNext,
      'how you can check for completion': okText.howToCheck,
      'how a web user can check for completion': okText.howWebUserChecks
    };
  }
  return {
    'what happens next': `Your request will not be processed, because ${getRequestFailureReason(requestResult, extraBranch)}`,
    'how you can check for completion': 'Not applicable.',
    'how a web user can check for completion': 'Not applicable.'
  };
};
// Returns the facts about a rule engine.
export const getRuleEngineFacts = (ruleEngineID: string) => {
  const ruleEngineData = ruleEngines[ruleEngineID] || [null, null];
  return {
    identifier: ruleEngineID,
    name: ruleEngineData[0] || null,
    sponsor: ruleEngineData[1] || null
  };
};
// Returns the facts about rule engines.
export const getRuleEnginesFacts = (ruleEngineIDSet: Iterable<string>) => {
  const ruleEnginesFacts = Array.from(ruleEngineIDSet).map(id => getRuleEngineFacts(id));
  objectSort(ruleEnginesFacts, 'name', 'alpha');
  return ruleEnginesFacts;
};
// Returns the basics about a report.
// Accepts an optional precomputed extract to avoid redundant reads when called
// in a loop over all reports (e.g. by listReports). When the extract comes from
// getReportExtracts, it carries a superseded flag; otherwise the flag is computed.
// With an extract provided, failure is impossible, so the return type narrows
// to ReportBasics; without one, an error object may be returned.
// XXX Why are these overloads necessary? Can't we just have one function?
export function getReportBasics(
  timeStamp: string, jobID: string, extract: ReportExtract
): Promise<ReportBasics>;
export function getReportBasics(
  timeStamp: string, jobID: string, extract?: ReportExtract | null
): Promise<ReportBasics | {error: string}>;
export async function getReportBasics(
  timeStamp: string, jobID: string, extract: ReportExtract | null = null
): Promise<ReportBasics | {error: string}> {
  const extractProvided = !!extract;
  // If an extract was not provided, verify the report exists and read it.
  if (!extract) {
    // Get the creation time of the report.
    const reportStats = await getReportStats(timeStamp, jobID);
    // If the  report does not exist:
    if (!reportStats) {
      // Log and return this.
      console.error(`Report ${timeStamp}-${jobID} does not exist.`);
      return {
        error: `Report ${timeStamp}-${jobID} could not be retrieved.`
      };
    }
    // Otherwise, i.e. if it exists, get an extract of the report.
    const fetchedExtract = await getReportExtract(timeStamp, jobID);
    // If this failed, return why.
    if ('error' in fetchedExtract) {
      return fetchedExtract;
    }
    extract = fetchedExtract;
  }
  const {url, description, reportTime} = extract;
  // Get whether this report has been superseded.
  const isSuperseded = extractProvided
    ? extract.superseded === true
    : (await getReportExtracts(true))
      .every(ex => ex.timeStamp !== timeStamp || ex.jobID !== jobID);
  // Get the basics about the report.
  const basics = {
    identifier: `${timeStamp}-${jobID}`,
    'completion date and time': reportTime,
    'days since the report was completed': getAgoDays(new Date(reportTime)),
    'tested web page': {
      description,
      URL: url
    },
    'whether a later report about the same page exists': isSuperseded
  };
  // Return them.
  return basics;
}
// Returns the specification of an issue.
export const getIssueSpec = (issueID: string) => {
  // Get the issue specification.
  const issueSpec = issueSpecs[issueID];
  // If it exists:
  if (issueSpec) {
    const {summary, wcag, weight, why} = issueSpec;
    // If the issue is non-ignorable and fully classified:
    if (issueID !== 'ignorable' && summary && wcag && [1, 2, 3, 4].includes(weight) && why) {
      // Return its specification.
      return issueSpec;
    }
    // Otherwise, return this.
    return null;
  }
  // Otherwise, i.e. if it does not exist, return this.
  return null;
};
