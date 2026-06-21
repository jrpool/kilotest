/*
  api.js
  Responds to the targets request.
*/

// IMPORTS

const {
  getLogs,
  getNowStamp,
  getRandomString,
  getReportData
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to a targets request.
exports.response = async () => {
  const availableReports = [];
  // Get the non-hidden logs.
  const targetLogs = await getLogs();
  // For each log:
  for (const targetLog of targetLogs) {
    const {jobName} = targetLog;
    const [timeStamp, jobID] = jobName.split('-');
    const {superseded, url, what} = targetLog;
    // Get data about its report.
    const data = await getReportData(timeStamp, jobID);
    const {
      creationDate,
      daysAgo,
      issueCount,
      toolNames,
      toolCount,
      reporterNames,
      reporterCount,
      violatorCount,
      preventedToolNames,
      preventedToolCount
    } = data;
    availableReports.push({
      identifier: jobName,
      'creation date': creationDate,
      'days since the creation date': daysAgo,
      'tested web page': {
        description: what,
        URL: url
      },
      'whether a later report about the same page exists': !! superseded,
      'rule engines that tried to test the page': {
        number: toolCount,
        names: toolNames
      },
      'rule engines that were unable to test the page': {
        number: preventedToolCount,
        names: preventedToolNames
      },
      'rule engines that reported issues': {
        number: reporterCount,
        names: reporterNames
      },
      'number of issues reported': issueCount,
      'number of HTML elements reported as exhibiting issues': violatorCount,
      'URLs for getting data about the reported issues': {
        'for you': `${thisHost}/api/reportIssues/${timeStamp}/${jobID}`,
        'for humans': `${thisHost}/reportIssues/${timeStamp}/${jobID}`
      },
      'URL for getting the full technical report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
    });
  }
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by an agent to the Kilotest service. The agent requested data about the web pages that Kilotest had tested for accessibility, usability, and standard-conformity and, for each page, statistics about the results of the tests. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes API endpoints for agents and web UI URLs for humans to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), whose home page contains an introduction and a link to a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'summarizeQualityOfAllTestedWebPages',
    request: {
      'type of request': {
        identifier: 'targets',
        description: 'Summarize the quality of all tested web pages.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/targets`,
        'equivalent URL for humans': `${thisHost}/targets.html`
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'available reports': availableReports
  };
  return content;
};
