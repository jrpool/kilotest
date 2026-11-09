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
import {checkLength, getAllowedRedirectURL, isAllowedTarget, isURL} from '../util.ts';
import {sendAlert} from '../alerts.ts';
import {getRegistry} from '../registry.ts';
import type {PlannedPage, Registry} from '../registry.ts';
import {describeRefusal, nameBounds} from '../requests.ts';
import type {SubmitResult} from '../requests.ts';
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

// Facts about a page, as in the PageFacts response schema.
export type PageFacts = {
  identifier: string;
  name: string;
  URL: string;
  sites: string[];
  'identifier of the latest report': string;
};
// Facts about a site, as in the SiteFacts response schema.
export type SiteFacts = {identifier: string; name: string; 'count of tested pages': number};
// A page that a request concerns, as in the RequestedPage response schema.
export type RequestedPageView = {
  'site identifier': string | null;
  'site name': string;
  'page identifier': string | null;
  'page name': string;
  URL: string;
};
// The disposition of a request for a test, or null if the request was invalid (in which case its details carry the error).
export type RequestDisposition = {
  'what happens next': string;
  'report identifier'?: string | null;
  'how you can check for completion': string;
  'how a web user can check for completion'?: string;
  'do you want to wait for completion'?: string;
  'whether your request was referred to management review'?: boolean;
  'possible duplicates'?: (PageFacts & {'reason for suspicion': string})[];
  'similar sites'?: (SiteFacts & {'reason for suspicion': string})[];
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
      'level 1': 'Use the listSites tool to get a list of tested sites, and then the listPages tool to get a list of the tested pages of one site, each with the identifier of its latest report, for use with the listIssues tool.',
      'level 2': 'Use the listIssues tool to get a list of issues in one report, each with a link to the level-3 results for that issue. The response also includes a history of reports about the page, each with a link to its own level-2 results.',
      'level 3': 'Use the listViolators tool to get a list of elements on one page that were reported in one report as exhibiting one issue, each with a link to the level-4 results for that violator.',
      'level 4': 'Use the listDiagnoses tool to get a list of diagnoses of how one element on one page exhibited one issue in one report.',
    },
    'how to generate more findings': {
      'new testing': 'If no report is available yet about a page, use the requestPageTest tool to request that it be tested if its site is in the listSites output, or otherwise the requestNewTest tool; for immediate testing set the reviewImmediately parameter to true. A request for immediate testing of a page that may already have been tested is referred to management review.',
      'retesting': 'If you believe that the latest report about a page is obsolete (e.g., because the page has been revised), use the requestRetest tool to request that the page be retested; for immediate retesting set its reviewImmediately parameter to true.',
      'approval': 'Requests are reviewed by management, usually in 1 hour to one day. Orders are reviewed immediately. Reviews result in approval or rejection.',
      'latency': 'An approved test typically finishes in 2 to 4 minutes.',
      'request confirmation': 'After submitting a request and waiting for review by management, you can use the listSites and listPages tools to determine whether the request has been fulfilled: a request for a new test adds a page entry linking to its results, and a retest request adds a later report about the page.',
      'order confirmation': 'After ordering a test or retest, you will receive a rejection or a report identifier, which you can use to call the awaitTest tool. That tool blocks until the test completes, fails, or a maximum wait time elapses, and then returns the outcome. If you do not call awaitTest, you can wait 2 to 4 minutes and then, if the test is complete, the listIssues tool called with the report identifier will succeed.'
    }
  },
  'URL': `${getThisHost()}/mcp`,
  'web users can obtain similar functionalities at': getThisHost()
});
// Returns the identifiers of the latest reports about all tested pages, by page identifier.
export const getLatestReportIDs = async (): Promise<Map<string, string>> => new Map(
  (await getReportExtracts(true)).map(extract => [extract.pageID, extract.id])
);
// Returns facts about a tested page in a registry.
export const getPageFacts = (registry: Registry, pageID: string, latestReportIDs: Map<string, string>): PageFacts => {
  const {name, url, sites} = registry.pages[pageID] as {name: string; url: string; sites: string[]};
  return {
    identifier: pageID, name, URL: url, sites, 'identifier of the latest report': latestReportIDs.get(pageID) as string
  };
};
// Returns facts about a site in a registry.
export const getSiteFacts = (registry: Registry, siteID: string, latestReportIDs: Map<string, string>): SiteFacts => ({
  identifier: siteID,
  name: registry.sites[siteID] as string,
  'count of tested pages': Object.entries(registry.pages)
  .filter(([pageID, page]) => page.sites.includes(siteID) && latestReportIDs.has(pageID)).length
});
// Returns a description of a page that a request concerns.
export const viewPage = (page: PlannedPage): RequestedPageView => ({
  'site identifier': page.siteID,
  'site name': page.siteName,
  'page identifier': page.pageID,
  'page name': page.pageName,
  URL: page.url
});
// Returns the disposition of a submitted request other than one citing a nonexistent report. okText describes how to check for the fulfillment of a pending request.
export const buildSubmissionDisposition = async (
  result: Exclude<SubmitResult, {result: 'nonreport'}>,
  okText: {howToCheck: string; howWebUserChecks: string}
): Promise<RequestDisposition> => {
  // If a job was created:
  if (result.result === 'ordered') {
    return {
      'what happens next': 'Testing has begun. Once it finishes, the report will be available via the listIssues tool.',
      'report identifier': result.reportID,
      'how you can check for completion': `Call the listIssues tool with reportID "${result.reportID}" to learn whether the report is ready.`,
      'do you want to wait for completion': 'Testing typically takes 2 to 4 minutes. Do you want to wait (and be notified of completion) instead of checking back later? If so, call the awaitTest tool with the same reportID.'
    };
  }
  const registry = await getRegistry();
  const latestReportIDs = await getLatestReportIDs();
  // Get the possible duplicates and similar sites, if the request was checked for them.
  const checks = 'possibleDuplicates' in result ? {
    'possible duplicates': result.possibleDuplicates.map(({pageID, reason}) => ({
      ...getPageFacts(registry, pageID, latestReportIDs), 'reason for suspicion': reason
    })),
    'similar sites': result.similarSites.map(({siteID, reason}) => ({
      ...getSiteFacts(registry, siteID, latestReportIDs), 'reason for suspicion': reason
    }))
  } : {};
  // If the request awaits approval:
  if (result.result === 'pending') {
    const referral = 'Your request was referred to management review, because the page or its site may already have been tested (see the possible duplicates and similar sites). If one of them is what you want, you can use its results now. Otherwise, your request';
    return {
      'what happens next': `${result.referred ? referral : 'Your request'} is likely to be approved and processed within 1 hour to 1 day.`,
      'how you can check for completion': okText.howToCheck,
      'how a web user can check for completion': okText.howWebUserChecks,
      'whether your request was referred to management review': result.referred,
      ...checks
    };
  }
  // Otherwise, i.e. if the request was refused:
  return {
    'what happens next': `Your request will not be processed, because ${describeRefusal(result, registry)}`,
    'how you can check for completion': 'Not applicable.',
    ...checks
  };
};
// Returns why a request for a test of a new page is invalid, or the URL to which its URL redirects. The site name is checked only if given, and names must already have normalized white space.
export const checkNewPage = async ({siteName, pageName, url, reason}: {
  siteName?: string; pageName: string; url: string; reason: string;
}): Promise<{error: string} | {finalURL: string}> => {
  const checks = [
    ...(siteName === undefined ? [] : [checkLength(siteName, nameBounds.site.min, nameBounds.site.max, 'site name')]),
    checkLength(pageName, nameBounds.page.min, nameBounds.page.max, 'page name'),
    checkLength(reason, 20, 100, 'reason')
  ];
  const failure = checks.find(check => check.status === 'error');
  // If a name or the reason is too short or too long:
  if (failure) {
    return {error: `request invalid: ${failure.message.replace(/^The/, 'the')}`};
  }
  // If the URL is too short or too long:
  if (url.length < 12 || url.length > 300) {
    return {error: 'request invalid: you specified a URL for the page that is not between 12 and 300 characters long'};
  }
  // If the URL is invalid:
  if (!isURL(url)) {
    return {error: 'request invalid: you specified an invalid URL for the page'};
  }
  const disallowed = 'request invalid: the URL you specified does not resolve to a page that this deployment can test';
  // If the URL does not resolve to an allowed target:
  if (!(await isAllowedTarget(url))) {
    return {error: disallowed};
  }
  const finalURL = await getAllowedRedirectURL(url);
  // If the URL redirects to a target this deployment does not allow:
  if (finalURL === null) {
    // Alert a manager, since a redirect to a disallowed target on a request that itself named an allowed hostname suggests an attempted or accidental SSRF, rather than an ordinary mistake by a legitimate submitter.
    await sendAlert(
      'Kilotest: request rejected for redirecting to a disallowed target',
      `A request to test ${url} (page “${pageName}”) was rejected because it redirects to a target this deployment does not allow (e.g. a private, loopback, or link-local address).`
    );
    return {error: disallowed};
  }
  return {finalURL};
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
