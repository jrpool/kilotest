/*
  listReports.js
  Returns basics about all the available reports.
*/

// IMPORTS

const {getReportBasics, getResponseMetadata, getToolsFacts} = require('./util');
const {logsPath} = require('../util');
const fs = require('fs').promises;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the response body.
exports.response = async () => {
  // Initialize the response content.
  const responseContent = {
    'basics about all available reports': null
  };
  // Initialize an array of basics about the reports.
  const reportsBasics = [];
  // Get the names of the log files.
  const logFileNames = await fs.readdir(logsPath);
  // For each of them:
  for (const logFileName of logFileNames) {
    const [timeStamp, jobID] = logFileName.slice(0, -5).split('-');
    // Get the basics about its report.
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this succeeded, the log file is valid, and the report is not hidden:
    if (! reportBasics.error) {
      // Add the basics to the array.
      reportsBasics.push(reportBasics);
    }
  }
  // Sort the array by page description and secondarily by increasing completion time.
  reportsBasics.sort((a, b) => {
    if (a['tested web page'].description !== b['tested web page'].description) {
      return a['tested web page']
      .description
      .localeCompare(b['tested web page'].description, 'en', { sensitivity: 'base' });
    }
    return a['completion date and time'].localeCompare(b['completion date and time']);
  });
  // Add the sorted basics about the reports to the response content.
  responseContent['basics about all available reports'] = reportsBasics;
  // Create a response body.
  const content = {
    'tool collection': getToolsFacts(),
    'tool name': 'listReports',
    'this request': {
      description: 'Provide basics about all available reports.',
      method: 'GET',
      URLs: {
        'of this request': `${thisHost}/api/listReports`,
        'of the equivalent request for HTML output': `${thisHost}/targets.html`
      },
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return content;
};
