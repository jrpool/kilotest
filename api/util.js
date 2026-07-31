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
  getReportSize,
  ruleEngines
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
// Returns the facts about the tool collection (Kilotest).
exports.getToolsFacts = () => ({
  'name': 'Kilotest',
  'description': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against more than a thousand rules defined by an ensemble of ten rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to classify the rule violations into about 300 issues and makes facts about the issues and the violations retrievable at four levels of granularity. You can start by using the listReports tool to get a list of available reports. You can then use the listIssues tool to get a list of issues in one report. You can then use the listViolators tool to get a list of elements on the tested page that exhibited one issue. You can then use the listDiagnoses tool to get a list of diagnoses of the issue on one element.',
  'URLs': {
    'for JSON output': `${thisHost}/mcp`,
    'for HTML output': thisHost
  }
});
// Returns the facts about a rule engine.
exports.getRuleEngineFacts = ruleEngineID => {
  const ruleEngineData = ruleEngines[ruleEngineID] || [null, null];
  return {
    identifier: ruleEngineID,
    name: ruleEngineData[0] || null,
    sponsor: ruleEngineData[1] || null
  };
};
// Returns the basics about a report, without reading the report.
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
  // Otherwise, i.e. if its report exists, get the basics about it.
  const basics = {
    identifier: `${timeStamp}-${jobID}`,
    'creation date and time': getDateTime(timeStamp),
    'days since the creation date': getAgoDays(timeStamp),
    'tested web page': {
      description: what,
      URL: url
    },
    'whether a later report about the same page exists': !! superseded,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
    },
    'size of the report in bytes': reportSize,
    'URL to get the entire report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
  };
  // Return them.
  return basics;
};
// Returns the basics about an issue in a report, without reading the report.
exports.getIssueBasics = async (issueID, timeStamp, jobID) => {
  const issueClassification = issuesClassification[issueID];
  // If the issue is ignorable or is not classified:
  if (issueID === 'ignorable' || ! issueClassification) {
    // Log and return this.
    console.error(`Issue ${issueID} is ignorable or not classified.`);
    return {
      error: `Basics about issue ${issueID} are not available.`
    };
  }
  const {summary = null, weight = null, why = null} = issueClassification;
  // Otherwise, i.e. if the issue is non-ignorable and classified, get its priority.
  const priority = typeof weight === 'number'
  ? ['lowest', 'low', 'high', 'highest'][weight - 1]
  : null;
  // Get the basics about the issue.
  const basics = {
    identifier: issueID,
    summary,
    'impact on a user': why,
    priority,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/listViolators/${issueID}/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
  // Return them.
  return basics;
};
// Returns the details about an issue in a report, not including a list of its violators.
exports.getIssueDetails = (issueID, report) => {
  // Initialize data about the issue.
  const reporterIDs = new Set();
  const violatorIndexes = new Set();
  // For each act in the report:
  report.acts.forEach(act => {
    // If the act is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each of the standard instances of the act:
      instances.forEach(instance => {
        // If the instance has the issue:
        if (instance.issueID === issueID) {
          // Ensure the rule engine is a reporter in the data.
          reporterIDs.add(which);
          const {catalogIndex} = instance;
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure it is a violator in the data.
            violatorIndexes.add(catalogIndex);
          }
        }
      });
    }
  });
  // Return the details.
  return {
    'names of rule engines with violated rules belonging to the issue': Array.from(reporterIDs),
    'count of violators, i.e. elements exhibiting the issue': violatorIndexes.size
  };
};
// Returns the basics about a violator.
exports.getViolatorBasics = async (catalogIndex, report) => {
  const {catalog, id} = report;
  // If the report has no id or no catalog:
  if (! (id && catalog)) {
    // Return a failure.
    return {
      error: ' Basics about violators in the report are not available.'
    };
  }
  const violator = catalog[catalogIndex];
  // Otherwise, if the report has a catalog but the specified violator is not in it:
  if (! violator) {
    // Return this.
    return {
      error: `Basics about violator ${catalogIndex} in report ${id} are not available`
    };
  }
  const {pathID = null, startTag = null, text = null} = violator;
  // Otherwise, i.e. if the violator is in the catalog, get the basics about the violator.
  const basics = {
    identifier: catalogIndex,
    'start tag': startTag,
    'inner text': text,
    'XPath': pathID
  };
  // Return them.
  return basics;
};
// Returns a report or an error message.
exports.getReportIfOK = async (timeStamp, jobID, reportBasicsError) => {
  // If the report basics were not retrievable, the log file is invalid, or the report is hidden:
  if (reportBasicsError) {
    // Log and return this.
    console.error(`Basics about report ${timeStamp}-${jobID} not obtained (${reportBasicsError})`);
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
