/*
  util.js
  Utilities for API requests.
*/

// IMPORTS

const {sendAlert} = require('../alerts');
const {
  getAgoDays,
  getLog,
  getNowStamp,
  getPlainText,
  getRandomString,
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
  'description': 'Kilotest tools generate and make available findings about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages. A Kilotest job generates findings by using Testaro to test a page against more than a thousand rules defined by an ensemble of ten rule engines. Testaro produces a report of the job. The report describes violations of the rules. Kilotest uses Testilo to classify the rule violations into about 300 issues and makes facts about the issues and the violations retrievable at four levels of granularity. You can start by using the listReports tool to get a list of available reports. You can then use the listIssues tool to get a list of issues in one report. You can then use the listViolators tool to get a list of elements on the tested page reported as exhibiting one issue. You can then use the listDiagnoses tool to get a list of diagnoses of how one element exhibited the issue.',
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
exports.getReportBasics = async (timeStamp, jobID, withURLs = true) => {
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
      error: `Report ${timeStamp}-${jobID} is not available.`
    };
  }
  const {superseded = false, url, what} = log;
  // Otherwise, i.e. if the log is valid and the report is available, get its time and size.
  const reportStats = await getReportStats(timeStamp, jobID);
  // If the  report does not exist:
  if (!reportStats) {
    // Log and return this.
    console.error(`Log ${timeStamp}-${jobID} is valid but its report does not exist.`);
    return {
      error: `Report ${timeStamp}-${jobID} could not be retrieved.`
    };
  }
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
    'whether a later report about the same page exists': !!superseded,
    'size of the report in bytes': reportSize,
    'URL to get the entire report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
  };
  // If detail URLs are specified:
  if (withURLs) {
    // Add URLs for more details to the basics.
    basics['URLs for more details'] = {
      'for JSON output': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
    };
    // If the report has not been superseded:
    if (!superseded) {
      // Add instructions for a retest request to the basics.
      basics['how to request that the page be retested'] = {
        URLs: {
          'for JSON output': `${thisHost}/api/requestRetest/${timeStamp}/${jobID}`,
          'for HTML output': `${thisHost}/retestRecForm.html/${timeStamp}/${jobID}`
        },
        'request method': 'POST',
        'request body': {
          reason: '20- to 100-character reason why the page should be retested'
        }
      };
      // Add instructions for a retest request to the basics.
      basics['instructions for requesting that the page be retested'] = {
        'how to construct the URL of a request': {
          encodedReason: 'replace this segment with a 20- to 100-character URI-component encoding of a reason why the page should be retested'
        },
        'how to check whether the request has been fulfilled': 'use the listReports tool to determine whether a report about the page has become available (typical wait time: 1 hour to 1 day)'
      };
    }
  }
  // Return the basics.
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
