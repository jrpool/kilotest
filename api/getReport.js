/*
  getReport.js
  Returns one report.
*/

// IMPORTS

const {
  getResponseMetadata,
  getToolsFacts,
  thisHost
} = require('./util');
const {getReport, getReportStats} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp = '', jobID = ''] = args;
  // Initialize the response content.
  const responseContent = {
    'size of the report in bytes': null,
    'full report': null
  };
  // Get the report size.
  const reportStats = await getReportStats(timeStamp, jobID);
  // If this failed:
  if (!reportStats) {
    // Add this to the response content.
    responseContent['size of the report in bytes'] = 'Error: The report could not be accessed for an unknown reason.';
  }
  // Otherwise, i.e. if it succeeded:
  else {
    const {reportSize} = reportStats;
    // Add the size to the response content.
    responseContent['size of the report in bytes'] = reportSize;
    // Get the report (which may be only an error message).
    const report = await getReport(timeStamp, jobID);
    // Add it to the response content.
    responseContent['full report'] = report;
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'getReport',
    'this request': {
      description: 'Provide one full report in JSON format. The timeStamp and jobID parameters identify the report that I want details about. Those parameters were in the response to my earlier listIssues request.',
      method: 'GET',
      URL: `${thisHost}/api/getReport/${timeStamp}/${jobID}`,
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
