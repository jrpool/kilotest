/*
  listReports.js
  Lists all available Kilotest reports.
*/

// IMPORTS

const {getKilotestBasics, getReportBasics} = require('./util');
const {
  getLogs,
  getNowStamp,
  getRandomString
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for reports.
exports.response = async () => {
  // Initialize an array of basic facts about reports.
  const reportsBasics = [];
  // Get the available logs, with added job names.
  const availableLogs = await getEnhancedLogs();
  // For each log:
  for (const availableLog of availableLogs) {
    const {jobName} = availableLog;
    const [timeStamp, jobID] = jobName.split('-');
    // Get the basic facts about the report.
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this failed:
    if (reportBasics.error) {
      // Report this.
      console.error(`Failed to get facts for report ${jobName} (${reportBasics.error}).`);
    }
    // Otherwise, i.e. if it succeeded:
    else {
      // Add the facts to the array.
      reportsBasics.push(reportBasics);
    }
  }
  // Create a response body.
  const content = {
    summary: `This document fulfills a request made by a language model to a Kilotest tool. The model asked which reports about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages are available from Kilotest. Each report describes the results of a job that tested one web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs more than a thousand tests on a public web page, using a combination of rule- and machine-learning-based methods. Kilotest exposes API endpoints and web UI URLs to recommend web pages for testing and to obtain information from Kilotest reports. You and your users can learn more about Kilotest and the advantages of testing with an ensemble of rule engines at the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}).`,
    'tool collection name': 'Kilotest',
    'tool name': 'listAllAvailableReports',
    request: {
      description: 'List all available reports. For each report, the list should identify which page was tested and when and provide URLs to begin incremental retrieval of the test results from the report.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/reportList`,
        'for HTML output': `${thisHost}/targets.html`
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString()
    },
    'response content': reportsBasics
  };
  // Return it.
  return content;
};
