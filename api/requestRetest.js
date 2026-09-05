/*
  requestRetest.js
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, processTestRequest, thisHost} = require('./util');
const {getLatestReportExtracts, getReportsExtract} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp = '', jobID = '', reason = ''] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': {},
    'disposition of your request': null
  };
  const reasonLength = reason.length;
  // Get data on the available reports.
  const reportsExtract = await getReportsExtract();
  // Get data on the report.
  const reportExtract = Object
  .values(reportsExtract)
  .find(extract => extract.timeStamp === timeStamp && extract.jobID === jobID);
  const {what, url} = reportExtract || {};
  // If this failed:
  if (!reportExtract) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: the specified existing report is not an available report'
    };
  }
  // Otherwise, if the report has been superseded:
  else if (
    (await getLatestReportExtracts())
    .every(extract => extract.timeStamp !== timeStamp || extract.jobID !== jobID)
  ) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: a later report about the page exists'
    };
  }
  // Otherwise, if the encoded reason is too short or too long:
  else if (reasonLength < 20 || reasonLength > 100) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: your reason is not between 20 and 100 characters long'
    }
  }
  // Otherwise, i.e. if getting the report succeeded and the request is valid:
  else {
    // Process the request.
    await processTestRequest('retest', what, url, reason);
    // Add details about the request to the response content.
    responseContent['details about your request'] = {
      'date and time received': new Date().toISOString(),
      'page to be retested': {
        'description': what,
        'URL': url
      },
      'reason why the page should be retested': reason
    };
    // Add information about the disposition of the request to the response content.
    responseContent['disposition of your request'] = {
      'what happens next': 'Your request is likely to be approved and processed within 1 hour to 1 day.',
      'how you can check for completion': 'You can call the listReports tool to learn whether the page has been retested and a new report is available.',
      'how a web user can check for completion': `A web user can visit ${thisHost}/listReports.html to learn whether the page has been retested and a new report is available.`
    };
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestRetest',
    'this request': {
      description: 'Process my request to retest a page. The timeStamp and jobID parameters identify the latest available report about the page. Those parameters were in the response to my earlier listIssues request. The reason property of the request body is the reason why the page should be retested.',
      method: 'POST',
      URL: `${thisHost}/api/requestRetest/${timeStamp}/${jobID}`,
      body: {
        reason
      },
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestRetestForm.html/${timeStamp}/${jobID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
