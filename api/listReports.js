/*
  listReports.js
  Returns basics about all the available reports.
*/

// IMPORTS

const {getReportBasics, getResponseMetadata, getToolsFacts, thisHost} = require('./util');
const {getReportsData} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async () => {
  // Initialize the response content.
  const responseContent = {
    'basics about all available reports': null
  };
  // Initialize an array of basics about the reports.
  const reportsBasics = [];
  // Get data on all available reports.
  const reportsData = await getReportsData();
  // For each report:
  for (const data of reportsData) {
    const {error, jobID, timeStamp} = data;
    // Get the basics about it (which may be only an error message).
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this succeeded:
    if (!error) {
      // Add instructions for getting details to the basics.
      reportBasics['how to get details about the report'] = {
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      };
      reportBasics['web users can get details about the report at'] = `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`;
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
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/targets.html`,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return content;
};
