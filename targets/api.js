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
      'tools that tried to test the page': reporterNames,
      'tools that were unable to test the page': {
        number: preventedToolCount,
        names: preventedToolNames
      },
      'tools that reported issues': {
        number: reporterCount,
        names: reporterNames
      }
    });
  }
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const response = {
    summary: `This document fulfills a request made by an agent to the Kilotest service. The agent requested data about the web pages that Kilotest had tested for accessibility, usability, and standard-conformity and statistics for each page on the results of the tests. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten testing tools, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes several API endpoints for agents and several web UI URLs for humans to obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of tools, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'requesting agent': {
        identifier: agentID,
        name: researchAgents[agentID]
      },
      'type of request': {
        identifier: 'targets',
        description: 'Which web pages are reports available about, and what are the statistics about the issues reported for each page?'
      },
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
      'URL of the human-oriented equivalent of this response': `${thisHost}/targets.html`
    },
    'available reports': availableReports
  };
  return response;
};
