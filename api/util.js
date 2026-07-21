/*
  util.js
  Utilities for API requests.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLog,
  getReport,
  getReportSize
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the basic facts about Kilotest required in every list.
exports.getKilotestBasics = () => ({
  'tool collection name': 'Kilotest',
  'tool collection description': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by performing more than a thousand tests on a page with the help of Testaro and an ensemble of ten rule engines. Kilotest analyzes the results with the help of Testilo and saves them in a report. You can interrogate Kilotest to retrieve information from the reports at four levels of granularity.',
  'tool collection URL': process.env.DEPLOYED_KILOTEST_HOST,
  'tool collection MCP server URL': `${thisHost}/mcp`
});
// Returns the basic facts about a report required in a list of reports.
exports.getReportBasics = async (timeStamp, jobID) => {
  // Get the log of the report.
  const log = await getLog(timeStamp, jobID, false);
  // If this failed:
  if (log.error) {
    // Return why.
    return log;
  }
  // Otherwise, i.e. if it succeeded but the report is hidden:
  if (log.hidden) {
    // Return this.
    return {
      error: `No report ${timeStamp}-${jobID} is available.`
    };
  }
  const {superseded = false, url = null, what = null} = log;
  // Otherwise, i.e. if the report is available, get its size.
  const reportSize = await getReportSize(timeStamp, jobID);
  // If the  report does not exist:
  if (! reportSize) {
    // Return this.
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
// Returns the basic facts about an issue required in a list of the issues in a report.
exports.getIssueBasics = async (issueID, timeStamp, jobID) => {
  const issueClassification = issuesClassification[issueID];
  if (! issueClassification) {
    return {
      error: `Issue ${issueID} not classified`
    };
  }
  const {summary = null, weight = null, why = null} = issueClassification;
  const priority = weight ? ['lowest', 'low', 'high', 'highest'][weight - 1] : null;
  return {
    identifier: issueID,
    summary,
    'impact on a user': why,
    priority,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
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
      error: error || `Report ${timeStamp}-${jobID} has no catalog`
    };
  }
  const violator = catalog[catalogIndex];
  // Otherwise, if the specified violator is not in the catalog:
  if (! violator) {
    return {
      error: `Violator ${catalogIndex} not in the catalog`
    };
  }
  const {pathID = null, startTag = null, text = null} = violator;
  // Otherwise, i.e. if the violator is in the catalog, return basic facts about the violator.
  return {
    identifier: String(catalogIndex),
    'start tag': startTag,
    'inner text': text,
    'XPath': pathID
  };
};
