/*
  util.js
  Utilities for API requests.
*/

// IMPORTS

const {sendAlert} = require('../alerts');
const {
  getAgoDays,
  getNowStamp,
  getPlainText,
  getRandomString,
  getReportsData,
  getReportStats,
  issuesClassification,
  objectSort,
  ruleEngines,
  updateRecs
} = require('../util');

// CONSTANTS

const thisHost = exports.thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns uniform metadata for every response.
exports.getResponseMetadata = () => ({
  identifier: `${getNowStamp()}-${getRandomString(3)}`,
  'date and time': new Date().toISOString()
});
// Returns facts about the tool collection (Kilotest).
exports.getToolsFacts = () => ({
  'name': 'Kilotest',
  'description': {
    'what Kilotest does': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against more than a thousand rules defined by an ensemble of ten rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to enhance the report with a classification of the rule violations into about 300 issues. Kilotest makes facts about the issues and the violations retrievable at four levels of granularity.',
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
  'URL': `${thisHost}/mcp`,
  'how web users can obtain similar functionalities': {
    URL: thisHost
  }
});
// Returns the facts about a rule engine.
const getRuleEngineFacts = exports.getRuleEngineFacts = ruleEngineID => {
  const ruleEngineData = ruleEngines[ruleEngineID] || [null, null];
  return {
    identifier: ruleEngineID,
    name: ruleEngineData[0] || null,
    sponsor: ruleEngineData[1] || null
  };
};
// Returns the facts about rule engines.
exports.getRuleEnginesFacts = ruleEngineIDSet => {
  const ruleEnginesFacts = Array.from(ruleEngineIDSet).map(id => getRuleEngineFacts(id));
  objectSort(ruleEnginesFacts, 'name', 'alpha');
  return ruleEnginesFacts;
};
// Returns the basics about a report, without reading the report.
exports.getReportBasics = async (timeStamp, jobID) => {
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
  // Get data on the available reports.
  const reportsData = await getReportsData();
  // Get data on the report.
  const reportData = reportsData.find(data => data.timeStamp === timeStamp && data.jobID === jobID);
  // If no such report exists:
  if (!reportData) {
    // Return this.
    return {
      error: `Report ${timeStamp}-${jobID} does not exist.`
    };
  }
  const {url, what} = reportData;
  // Otherwise, i.e. if the report exists, get data on all available reports on the page.
  const pageReportsData = reportsData.filter(data => data.what === what && data.url === url);
  const lastPageReportData = pageReportsData.pop();
  // Get whether this report has been superseded.
  const isSuperseded = lastPageReportData.timeStamp !== timeStamp
  || lastPageReportData.jobID !== jobID;
  const {reportTime} = reportStats;
  // Get the basics about the report.
  const basics = {
    identifier: `${timeStamp}-${jobID}`,
    'completion date and time': reportTime.toISOString(),
    'days since the report was completed': getAgoDays(reportTime),
    'tested web page': {
      description: what,
      URL: url
    },
    'whether a later report about the same page exists': isSuperseded
  };
  // Return them.
  return basics;
};
// Returns the classification of an issue.
exports.getIssueClassification = issueID => {
  // Get the issue classification.
  const issueClassification = issuesClassification[issueID] ?? {};
  const {summary, wcag, weight, why} = issueClassification;
  // If the issue is non-ignorable and fully classified:
  if (
    issueID
    && issueID !== 'ignorable'
    && issueClassification
    && summary
    && wcag
    && [1, 2, 3, 4].includes(weight)
    && why
  ) {
    // Return the classification.
    return issueClassification;
  }
  // Otherwise, i.e. if it is ignorable or not fully classified, return this.
  return null;
};
// Processes a test or retest request.
exports.processTestRequest = async (testType, what, url, why) => {
  // Get an email-safe version of the reason.
  const plainWhy = getPlainText(why);
  // Update the waiting recommendations as a transaction.
  const updateResult = await updateRecs(what, url, plainWhy);
  // If the recommendation was a duplicate:
  if (updateResult.error === 'duplicate') {
    // Return this.
    return {
      status: 'error',
      message: 'Duplicate request'
    };
  }
  // Otherwise, i.e. if it was not a duplicate, alert a manager about it.
  await sendAlert(
    `Kilotest: new ${testType} recommendation in the API`,
    `Target: ${what}\nURL: ${url}\nReason: ${plainWhy}`
  );
};
