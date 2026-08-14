/*
  requestFeature.js
  Processes a request to add or improve a feature and returns an acknowledgement.
*/

// IMPORTS

const {getResponseMetadata, getToolsFacts, thisHost} = require('./util');
const {sendAlert} = require('../alerts');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [request = ''] = args;
  // Initialize the response content.
  const responseContent = {
    'details about your request': null
  };
  // If the request is empty:
  if (!request) {
    // Add this to the response content.
    responseContent['details about your request'] = {
      error: 'request invalid: request is empty'
    };
  }
  // Otherwise, i.e. if it exists:
  else {
    // Notify the manager.
    await sendAlert('MCP feature request received', request);
    // Add the disposition to the response content.
    responseContent['details about your request'] = {
      'date and time received': new Date().toISOString(),
      disposition: 'received and logged; manager notified'
    };
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestFeature',
    'this request': {
      description: 'Process my request to add or improve a feature.',
      method: 'POST',
      URL: `${thisHost}/api/requestFeature`,
      body: {
        request
      },
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': null,
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
