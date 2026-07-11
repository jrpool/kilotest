/*
  api.js
  Responds to the reportList API request.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLogs,
  getNowStamp,
  getRandomString,
  getReportSize
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for reports.
exports.response = async () => {
  // Initialize an array of facts about reports.
  const reportsFacts = [];
  // Get the available logs, with added job names.
  const availableLogs = await getLogs();
  // For each log:
  for (const availableLog of availableLogs) {
    const {jobName} = availableLog;
    const [timeStamp, jobID] = jobName.split('-');
    const reportSize = await getReportSize(timeStamp, jobID);
    const {superseded, url, what} = availableLog;
    // Add facts about its report to the array.
    reportsFacts.push({
      identifier: jobName,
      'creation date and time': getDateTime(timeStamp),
      'days since the creation date': getAgoDays(timeStamp),
      'tested web page': {
        description: what,
        URL: url
      },
      'whether a later report about the same page exists': !! superseded,
      'URLs for more details': {
        'for you': `${thisHost}/api/reportIssues/${timeStamp}/${jobID}`,
        'for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'size of the report in bytes': reportSize,
      'URL to get the entire report as machine-oriented JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
    });
  }
  // Create a response body.
  const content = {
    summary: `This document fulfills a request made by a language model to a Kilotest tool. The model asked which reports about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages are available from Kilotest. Each report describes the results of a job that tested one web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs more than a thousand tests on a public web page, using a combination of rule- and machine-learning-based methods. Kilotest exposes API endpoints and web UI URLs to recommend web pages for testing and to obtain information from Kilotest reports. You and your users can learn more about Kilotest and the advantages of testing with an ensemble of rule engines at the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}).`,
    'tool collection name': 'Kilotest',
    'tool name': 'listAllAvailableReports',
    request: {
      'type of request': {
        identifier: 'reportList',
        description: 'Get a list of all available reports. For each report, the list should identify which page was tested and when and provide URLs to begin incremental retrieval of the test results from the report.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/reportList`,
        'equivalent URL for humans': `${thisHost}/targets.html`
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'requested information': reportsFacts
  };
  // Return it.
  return content;
};
