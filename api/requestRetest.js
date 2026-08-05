/*
  requestRetest.js
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, thisHost} = require('./util');
const {getLog, updateRecs} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp, jobID, encodedReason] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': {}
  };
  const reasonLength = encodedReason.length;
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
    const why = decodeURIComponent(encodedReason);
    // Process the request.
    await updateRecs(what, url, why);
    // Add details about the request to the response content.
    responseContent['details about your request'] = {
      'date and time received': new Date().toISOString(),
      'page to be retested': {
        'description': what,
        'URL': url
      },
      'reason why the page should be retested': why
    };
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listIssues',
    'this request': {
      description: 'Process and acknowledge my request to retest a page. The timeStamp and jobID parameters identify the latest available report about the page. Those parameters were in the response to my earlier listReports request. The encodedReason parameter is the URI-component encoding of a reason why the page should be retested.',
      method: 'GET',
      URLs: {
        'of this request': `${thisHost}/api/requestRetest/${timeStamp}/${jobID}/${encodedReason}`,
        'of the equivalent request for HTML output':
        `${thisHost}/retestRecForm.html/${timeStamp}/${jobID}`
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
