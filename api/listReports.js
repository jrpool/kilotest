/*
  listReports.js
  Lists all available Kilotest reports.
*/

// IMPORTS

const {getKilotestBasics, getReportBasics, getResponseMetadata} = require('./util');
const {logsPath} = require('../util');
const fs = require('fs').promises;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for a list of reports.
exports.response = async () => {
  // Get the basic facts about Kilotest.
  const kilotestBasics = getKilotestBasics();
  // Initialize an array of basic facts about reports.
  const reportsBasics = [];
  // Get the names of the log files.
  const logFileNames = await fs.readdir(logsPath);
  // For each of them:
  for (const logFileName of logFileNames) {
    const [timeStamp, jobID] = logFileName.slice(0, -5).split('-');
    // Get the basic facts about its report.
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this succeeded, the log file is valid, and the report is not hidden:
    if (! reportBasics.error) {
      // Add the facts to the array.
      reportsBasics.push(reportBasics);
    }
  }
  // Create a response body.
  const content = {
    ... kilotestBasics,
    'tool name': 'listAllAvailableReports',
    request: {
      description: 'List all available reports. For each report, the list should state which page was tested, when the job was performed, and which URL I can use for incremental retrieval of the test results from the report.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/reportList`,
        'for HTML output': `${thisHost}/targets.html`
      },
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': reportsBasics
  };
  // Return it.
  return content;
};
