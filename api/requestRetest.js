/*
  requestRetest.js
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, processTestRequest, thisHost} = require('./util');
const {getLog} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp, jobID, reason] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': {}
  };
  const reasonLength = reason.length;
  // Get the log.
  const log = await getLog(timeStamp, jobID);
  const {hidden, superseded, url, what} = log;
  // If this failed:
  if (log.error) {
    // Add this to the response content.
    responseContent['details about your request'] = log;
  }
  // Otherwise, if the report is hidden:
  else if (hidden) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: no such report is available'
    };
  }
  // Otherwise, if the report has been superseded:
  else if (superseded) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: a later report about the page exists'
    };
  }
  // Otherwise, if the encoded reason is too short or too long:
  else if (reasonLength < 20 || reasonLength > 100) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: the URI-component encoding of your reason is not between 20 and 100 characters long'
    }
  }
  // Otherwise, i.e. if getting the log succeeded and the request is valid:
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
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestRetest',
    'this request': {
      description: 'Process and acknowledge my request to retest a page. The timeStamp and jobID parameters identify the latest available report about the page. Those parameters were in the response to my earlier listReports request. The reason property of the request body is the reason why the page should be retested.',
      method: 'POST',
      URLs: {
        'of this request': `${thisHost}/api/requestRetest/${timeStamp}/${jobID}`,
        'of the equivalent request for HTML output':
        `${thisHost}/retestRecForm.html/${timeStamp}/${jobID}`
      },
      body: {
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
