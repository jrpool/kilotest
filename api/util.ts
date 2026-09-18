/*
  util.ts
  Utilities for API requests.
*/

// IMPORTS

import {sendAlert} from '../alerts.ts';
import {
  addTestRequest,
  getAgoDays,
  getReportExtracts,
  getNowStamp,
  getPlainText,
  getRandomString,
  getReportExtract,
  getReportStats,
  objectSort,
  ruleEngines
} from '../util.ts';
import type {ReportExtract} from '../util.ts';
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
// Processes a test or retest request and returns the result.
export const processTestRequest = async (
  testType: 'test' | 'retest', description: string, url: string, reason: string
): Promise<'url' | 'description' | 'retest' | 'duplicate' | 'added'> => {
  // Add the test request as a transaction if approvable and return the result.
  const additionResult = await addTestRequest(description, url, reason);
  // If the request was added:
  if (additionResult === 'added') {
    // Get an email-safe version of the reason.
    const plainReason = getPlainText(reason);
    // Alert a manager.
    await sendAlert(
      `Kilotest: new ${testType} request in the API`,
      `Target: ${description}\nURL: ${url}\nReason: ${plainReason}`
    );
  }
  // Return the result.
  return additionResult;
};
