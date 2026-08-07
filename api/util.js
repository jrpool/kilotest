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
// Returns the facts about the tool collection (Kilotest).
exports.getToolsFacts = () => ({
  'name': 'Kilotest',
  'description': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against more than a thousand rules defined by an ensemble of ten rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to classify the rule violations into about 300 issues and makes facts about the issues and the violations retrievable at four levels of granularity. You can start by using the listReports tool to get a list of available reports. If no report is available yet about the page that you want information about, you can use the requestTest tool to request that it be tested and await a report, usually within a day. You can use the listIssues tool to get a list of issues in one report. If you want the same page to be retested, you can request that with the requestRetest tool. You can use the listViolators tool to get a list of elements on the tested page that were reported as exhibiting one issue. You can then use the listDiagnoses tool to get a list of diagnoses of how one element exhibited the issue.',
  'URLs': {
    'for JSON output': `${thisHost}/mcp`,
    'for HTML output': thisHost
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
  // Get the creation time and size of the report.
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
  const pageReportsData = reportsData.filter(data => data.what === what && data.url === url);
  // Otherwise, i.e. if the report exists, get whether it has been superseded.
  const isSuperseded = pageReportsData.length > 1;
  const {reportTime, reportSize} = reportStats;
  // Otherwise, i.e. if its report exists, get the basics about it.
  const basics = {
    identifier: `${timeStamp}-${jobID}`,
    'completion date and time': reportTime.toISOString(),
    'days since the report was completed': getAgoDays(reportTime),
    'tested web page': {
      description: what,
      URL: url
    },
    'whether a later report about the same page exists': isSuperseded,
    'size of the report in bytes': reportSize,
    'URL to get the entire report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
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
