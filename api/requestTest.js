/*
  requestTest.js
  Processes a request to test a page and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, processTestRequest, thisHost} = require('./util');
const {getReportsData} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [what, url, reason] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': {}
  };
  const whatLength = what.length;
  // If the encoded description is too short or too long:
  if (whatLength < 10 || whatLength > 100) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: your description of the page to be tested is not between 10 and 100 characters long'
    };
  }
  // Otherwise, i.e. if it has a valid length:
  else {
    // Get data on the available reports.
    const reportsData = await getReportsData();
    // Get data on those that are about the specified page.
    const pageReportsData = reportsData.filter(data => data.what === what && data.url === url);
    // If any exist:
    if (pageReportsData.length) {
      // Add this to the response content.
      responseContent['details about your request'] = {
        error: 'request invalid: the page has already been tested and its report is available'
      };
    }
    // Otherwise, i.e. if none exist:
    else {
      // Process the request.
      await processTestRequest('test', what, url, reason);
      // Add details about the request to the response content.
      responseContent['details about your request'] = {
        'date and time received': new Date().toISOString(),
        'page to be tested': {
          description: what,
          'URL': url
        },
        'reason why the page should be tested': reason
      };
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestTest',
    'this request': {
      description: 'Process my request to test a page about which no report is available yet. I have provided a description and the URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestTest`,
      body: {
        description: what,
        URL: url,
        reason
      },
      'closest ancestor request': {
        'tool name': 'listReports',
        description: 'Provide basics about all available reports.',
        method: 'GET',
        URL: `${thisHost}/api/listReports`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/testRecForm.html`,
      'closest ancestor request': `${thisHost}/targets.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
