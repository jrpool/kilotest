/*
  listReports.js
  Returns basics about all the available reports.
*/

// IMPORTS

const {getReportBasics, getResponseMetadata, getToolsFacts, thisHost} = require('./util');
const {logsPath} = require('../util');
const fs = require('fs').promises;

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
    // Get the basics about its report (which may be only an error message).
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this succeeded, the log file is valid, and the report is not hidden:
    if (!reportBasics.error) {
      // Add instructions for getting details to the basics.
      reportBasics['how to get details about the report'] = {
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      };
      reportBasics['how a web user can get details about the report'] = {
        URL: `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      };
      // Add the basics to the array.
      reportsBasics.push(reportBasics);
    }
  }
  // Sort the array by page description and secondarily by completion recency.
  reportsBasics.sort((a, b) => {
    if (a['tested web page'].description !== b['tested web page'].description) {
      return a['tested web page']
      .description
      .localeCompare(b['tested web page'].description, 'en', {sensitivity: 'base'});
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
      URL: `${thisHost}/api/listReports`,
      'closest ancestor request': null,
      'URL of a similar request for web users': `${thisHost}/targets.html`,
      'URL of the closest ancestor request for web users': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return content;
};
