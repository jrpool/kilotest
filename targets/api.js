/*
  api.js
  Responds to the targets request.
*/

// IMPORTS

const {
  getLogs,
  getNowStamp,
  getRandomString,
  getReportData,
  researchAgents
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to a targets request.
exports.response = async agentID => {
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
      'number of issues reported': issueCount,
      'number of HTML elements reported as exhibiting issues': violatorCount,
      'tools that tried to test the page': {
        number: toolCount,
        names: toolNames
      },
      'tools that were unable to test the page': {
        number: preventedToolCount,
        names: preventedToolNames
      },
      'tools that reported issues': {
        number: reporterCount,
        names: reporterNames
      },
      'URLs for getting data on the reported issues': {
        'for you': `${thisHost}/api/${agentID}/reportIssues/${timeStamp}/${jobID}`,
        'for humans': `${thisHost}/reportIssues/${timeStamp}/${jobID}`
      },
      'URL for getting the full technical report as JSON': `${thisHost}/fullReport.html/${timeStamp}/${jobID}`
    });
  }
  // Get a response.
  const response = {
    summary: `This document fulfills a request made by an agent to the Kilotest service. The agent requested data about the web pages that Kilotest had tested for accessibility, usability, and standard-conformity and statistics for each page on the results of the tests. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten testing tools, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes API endpoints for agents and web UI URLs for humans to recommend web pages for testing and obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of tools, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), whose home page contains an introduction and a link to a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'requesting agent': {
        identifier: agentID,
        name: researchAgents[agentID]
      },
      'type of request': {
        identifier: 'targets',
        description: 'Give me summary data about each available report.'
      },
      URLs: {
        'URL of this request': `${thisHost}/api/${agentID}/targets`,
        'equivalent URL for humans': `${thisHost}/targets.html`
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'available reports': availableReports
  };
  return response;
};
