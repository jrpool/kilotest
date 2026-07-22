/*
  util.js
  Utilities for API requests.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLog,
  getNowStamp,
  getRandomString,
  getReport,
  getReportSize
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns uniform metadata for every response.
exports.getResponseMetadata = () => ({
  identifier: `${getNowStamp()}-${getRandomString(3)}`,
  'date and time': new Date().toISOString()
});
// Returns the basic facts about Kilotest required in every list.
exports.getToolsBasics = () => ({
  'name': 'Kilotest',
  'description': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against more than a thousand rules defined by an ensemble of ten rule engines. Testaro produces a report of the job containing standardized test results. Kilotest uses Testilo to classify the rule violations into about 300 issues and makes facts about the issues retrievable at four levels of granularity. You can start by using the listReports tool to get a list of available reports. You can then use the listIssues tool to get a list of issues in one report. You can then use the listViolators tool to get a list of elements on the tested page that exhibited one issue. You can then use the listDiagnoses tool to get a list of diagnoses of the issue on one element.',
  'URLs': {
    'for JSON output': `${thisHost}/mcp`,
    'for HTML output': thisHost
  }
});
// Returns the basic facts about a report required in a list of reports.
exports.getReportBasics = async (timeStamp, jobID) => {
  // Get the log of the report.
  const log = await getLog(timeStamp, jobID, false);
  // If this failed:
  if (log.error) {
    // Log and return why.
    console.error(log.error);
    return log;
  }
  // Otherwise, i.e. if it succeeded but the report is hidden:
  if (log.hidden) {
    // Return this.
    return {
      error: `No report ${timeStamp}-${jobID} is available.`
    };
  }
  const {superseded = false, url, what} = log;
  // Otherwise, i.e. if the log is valid and the report is available, get the report size.
  const reportSize = await getReportSize(timeStamp, jobID);
  // If the  report does not exist:
  if (! reportSize) {
    // Log and return this.
    console.error(`Log ${timeStamp}-${jobID} is valid but its report does not exist.`);
    return {
      error: `No report ${timeStamp}-${jobID} is available.`
    };
  }
  // Otherwise, i.e. if its report exists, get the basic facts about it.
  const facts = {
    identifier: `${timeStamp}-${jobID}`,
    'creation date and time': getDateTime(timeStamp),
    'days since the creation date': getAgoDays(timeStamp),
    'tested web page': {
      description: what,
      URL: url
    },
    'whether a later report about the same page exists': !! superseded,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
    },
    'size of the report in bytes': reportSize,
    'URL to get the entire report as machine-oriented JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
  };
  // Return them.
  return facts;
};
// Returns details about a report.
exports.getReportDetails = report => {
  const {
    strict = null, standard = null, device = 'default', browserID = null, executionTimeStamp = null
  } = report;
  // Get details about the report.
  const reportDetails = {
    'whether the job prohibited redirection': strict,
    'whether the report includes native results of rule engines': ['also', 'no'].includes(standard),
    'whether the report includes standardized results': ['also', 'only'].includes(standard),
    'device that was emulated by the job': device,
    'browser type that was used by the job': browserID,
    'when Kilotest made the job available to be performed': getDateTime(executionTimeStamp)
  };
  // Return them.
  return reportDetails;
};
// Returns a report or an error message.
const getReportIfOK = async (timeStamp, jobID, reportBasics) => {
  // If the report basics were not retrievable, the log file is invalid, or the report is hidden:
  if (reportBasics.error) {
    // Log and return this.
    console.error(`Basics about report ${timeStamp}-${jobID} not obtained (${reportBasics.error})`);
    return {
      status: 'error',
      message: `No facts about report ${timeStamp}-${jobID} are available.`
    };
  }
  // Otherwise, get the report.
  const report = await getReport(timeStamp, jobID);
  // Return it.
  return report;
};
// Returns the basic facts about an issue required in a list of the issues in a report.
exports.getIssueBasics = async (issueID, timeStamp, jobID) => {
  const issueClassification = issuesClassification[issueID];
  // If the issue is ignorable or is not classified:
  if (issueID === 'ignorable' || ! issueClassification) {
    // Log and return this.
    console.error(`Issue ${issueID} is ignorable or not classified.`);
    return {
      error: `Facts about ssue ${issueID} are not available.`
    };
  }
  const {summary = null, weight = null, why = null} = issueClassification;
  // Otherwise, i.e. if the issue is non-ignorable and classified, get its priority.
  const priority = typeof weight === 'number'
  ? ['lowest', 'low', 'high', 'highest'][weight - 1]
  : null;
  // Get the basic facts about the issue.
  const facts = {
    identifier: issueID,
    summary,
    'impact on a user': why,
    priority,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
  // Return them.
  return facts;
};
// Returns the basic facts about a violator required in a list of the violators of an issue.
exports.getViolatorBasics = async (catalogIndex, timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const {catalog, error} = report;
  // If this failed or the report has no catalog:
  if (error || ! catalog) {
    // Return a failure.
    return {
      error: `Facts about violators of issues in report ${timeStamp}-${jobID} are not available.`
    };
  }
  const violator = catalog[catalogIndex];
  // Otherwise, if the report has a catalog but the specified violator is not in it:
  if (! violator) {
    return {
      error: `Facts about violator ${catalogIndex} in report ${timeStamp}-${jobID} are not available`
    };
  }
  const {pathID = null, startTag = null, text = null} = violator;
  // Otherwise, i.e. if the violator is in the catalog, get the basic facts about the violator.
  const facts = {
    identifier: String(catalogIndex),
    'start tag': startTag,
    'inner text': text,
    'XPath': pathID
  };
  // Return them.
  return facts;
};
