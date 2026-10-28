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
import type {TestRequestResult} from '../util.ts';
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
    'what Kilotest does': 'Kilotest tools generate findings about the front-end quality (i.e. accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG of W3C) of web pages. A Kilotest job generates findings by using Testaro to test a page against about 1300 rules defined by an ensemble of twelve rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to enhance the report with a classification of the rule violations into about 380 issues and then saves the report for public retrieval. Kilotest makes facts about the tested pages, the issues, and the violations retrievable at four levels of granularity.',
    'how to retrieve findings': {
      'level 1': 'Use the listPages tool to get a list of tested pages, each with the identifier of its latest report, for use with the listIssues tool.',
      'level 2': 'Use the listIssues tool to get a list of issues in one report, each with a link to the level-3 results for that issue. The response also includes a history of reports about the page, each with a link to its own level-2 results.',
      'level 3': 'Use the listViolators tool to get a list of elements on one page that were reported in one report as exhibiting one issue, each with a link to the level-4 results for that violator.',
      'level 4': 'Use the listDiagnoses tool to get a list of diagnoses of how one element on one page exhibited one issue in one report.',
    },
    'how to generate more findings': {
      'new testing': 'If no report is available yet about a page, use the requestNewTest tool to request that it be tested, or the orderNewTest tool for immediate testing.',
      'retesting': 'If you believe that the latest report about a page is obsolete (e.g., because the page has been revised), use the requestRetest tool to request that the page be retested, or the orderRetest tool for immediate retesting.',
      'approval': 'Requests are manager-reviewed, usually in 1 hour to one day. Orders are automatically reviewed. Reviews result in approval or rejection.',
      'latency': 'An approved test typically finishes in 2 to 4 minutes.',
      'request confirmation': 'After submitting a request and waiting for manager review, you can use the listPages tool to determine whether the request has been fulfilled: a new-test request adds a page entry linking to its results, and a retest request adds a later report about the page.',
      'order confirmation': 'After ordering a test or retest, you will receive a rejection or a report identifier, which you can use to call the awaitTest tool. That tool blocks until the test completes, fails, or a maximum wait time elapses, and then returns the outcome. If you do not call awaitTest, you can wait 2 to 4 minutes and then, if the test is complete, the listIssues tool called with the report identifier will succeed.'
    }
  },
  'URL': `${getThisHost()}/mcp`,
  'web users can obtain similar functionalities at': getThisHost()
});
// Returns the human-readable reason a test/retest/instant-test request was not
// processed, given the result processTestRequest returned. requestResult is always a
// rejection reason here ('description', 'url', 'urlLength', 'queueFull', or an
// unrecognized value meaning 'duplicate'); callers pass their own extra branch for a
// requestResult value specific to their own request type ('reportExists' for requestNewTest, 'superseded' for
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
  if (requestResult === 'urlLength') {
    return 'the URL is not between 12 and 300 characters long.';
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
// request was not processed. Shared by requestNewTest, requestRetest, and orderNewTest,
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
// Returns the basics about a report, or an error object if the report cannot be read.
export const getReportBasics = async (
  reportID: string
): Promise<ReportBasics | {error: string}> => {
  // Verify that the report exists.
  const reportStats = await getReportStats(reportID);
  // If it does not exist:
  if (!reportStats) {
    // Log and return this.
    console.error(`Report ${reportID} does not exist.`);
    return {
      error: `Report ${reportID} could not be retrieved.`
    };
  }
  // Otherwise, i.e. if it exists, get an extract of the report.
  const extract = await getReportExtract(reportID);
  // If this failed, return why.
  if ('error' in extract) {
    return extract;
  }
  const {url, description, reportTime} = extract;
  // Get whether this report has been superseded.
  const isSuperseded = (await getReportExtracts(true))
  .every(ex => ex.id !== reportID);
  // Get the basics about the report.
  const basics = {
    identifier: reportID,
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
};
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
