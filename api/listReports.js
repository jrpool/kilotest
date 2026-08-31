/*
  listReports.js
  Returns basics about all the available reports.
*/

// IMPORTS

const {getReportBasics, getResponseMetadata, getToolsFacts, thisHost} = require('./util');
const {getReportExtracts} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async () => {
  // Initialize the response content.
  const responseContent = {
    'basics about all available reports': null,
    'how to request that a page with no report be tested': null,
    'how a web user can request that the page be tested': null
  };
  // Initialize an array of basics about the reports.
  const reportsBasics = [];
  // Get extracts of all available reports.
  const reportExtracts = await getReportExtracts();
  // For each report:
  for (const extract of reportExtracts) {
    const {error, jobID, timeStamp} = extract;
    // Get the basics about it (which may be only an error message).
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this succeeded:
    if (!error) {
      // Add instructions for getting details to the basics.
      reportBasics['how to get details about the report'] = {
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      };
      reportBasics['web users can get details about the report at'] = `${thisHost}/listIssues.html/${timeStamp}/${jobID}`;
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
  // Add instructions for requesting a test to the response content.
  responseContent['how to request that a page with no report be tested'] = {
    method: 'POST',
    URL: `${thisHost}/api/requestTest`,
    'request body': {
      description: '10- to 100-character description of the page conforming to the naming convention used in this list of reports',
      URL: '12- to 300-character URL of the page, including the https:// scheme and any query',
      reason: '20- to 100-character reason why the page should be tested'
    },
    'how to check whether the request has been fulfilled': 'use this listReports tool to determine whether a report about the page has become available (typical wait time: 1 hour to 1 day)'
  };
  // Add instructions for a web user to request a test to the response content.
  responseContent['how a web user can request that the page be tested'] = {
    URL: `${thisHost}/requestTestForm.html`
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listReports',
    'this request': {
      description: 'Provide basics about all available reports.',
      method: 'GET',
      URL: `${thisHost}/api/listReports`,
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listReports.html`,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
