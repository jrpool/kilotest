/*
  requestTest.js
  Processes a request to test a page and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, processTestRequest, thisHost} = require('./util');
const {getLog, logsPath} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [encodedDescription, encodedURL, encodedReason] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': {}
  };
  const description = decodeURIComponent(encodedDescription);
  const url = decodeURIComponent(encodedURL);
  const reason = decodeURIComponent(encodedReason);
  const whatLength = encodedDescription.length;
  // If the encoded description is too short or too long:
  if (whatLength < 10 || whatLength > 100) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: the URI-component encoding of your description of the page to be tested is not between 10 and 100 characters long'
    };
  }
  // Otherwise, i.e. if it has a valid length:
  else {
    // Get the names of the log files.
    const logFileNames = await fs.readdir(logsPath);
    // For each of them:
    for (const logFileName of logFileNames) {
      const [timeStamp, jobID] = logFileName.slice(0, -5).split('-');
      // Get the log.
      const log = await getLog(timeStamp, jobID);
      const {hidden, what} = log;
      // If its report is not hidden and has the specified description and URL:
      if (!hidden && what === description && log.url === url) {
        // Add this to the response content.
        responseContent['details about your request'] = {
          error: 'request invalid: the page has already been tested and its report is available'
        };
        break;
      }
    }
    // If the request is valid:
    if (!responseContent['details about your request'].error) {
      // Process the request.
      await processTestRequest('test', description, url, reason);
      // Add details about the request to the response content.
      responseContent['details about your request'] = {
        'date and time received': new Date().toISOString(),
        'page to be retested': {
          description,
          'URL': url
        },
        'reason why the page should be retested': reason
      };
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestTest',
    'this request': {
      description: 'Process and acknowledge my request to test a page about which no report is available yet. I have provided a description and the URL of the page and a reason why it should be tested.',
      method: 'POST',
      URLs: {
        'of this request':
        `${thisHost}/api/requestTest`,
        'of the equivalent request for HTML output': `${thisHost}/testRecForm.html`
      },
      body: {
        description,
        url,
        reason
      },
      'closest ancestor request': {
        'tool name': 'listReports',
        description: 'Provide basics about all available reports.',
        URLs: {
          'for JSON output': `${thisHost}/api/listReports`,
          'for HTML output': `${thisHost}/targets.html`
        }
      }
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
