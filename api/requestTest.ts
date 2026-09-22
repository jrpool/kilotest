/*
  requestTest.ts
  Processes a request to test an untested page and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {checkLength, isAllowedTarget, isURL, processTestRequest} from '../util.ts';
import {requestTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [description = '', url = '', reason = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const descriptionCheck = checkLength(description, 1, 100, 'description of the page');
  // If the description is invalid:
  if (descriptionCheck.status === 'error') {
    requestDetails = {
      error: `request invalid: your ${descriptionCheck.message}`
    };
  }
  // Otherwise, i.e. if the URL is too short or too long:
  else if (url.length < 12 || url.length > 300) {
    requestDetails = {
      error: 'request invalid: you specified a URL for the page that is not between 12 and 300 characters long'
    };
  }
  // Otherwise, i.e. if the URL is invalid:
  else if (!isURL(url)) {
    requestDetails = {
      error: 'request invalid: you specified an invalid URL for the page'
    };
  }
  // Otherwise, i.e. if the URL does not resolve to an allowed target:
  else if (!(await isAllowedTarget(url))) {
    requestDetails = {
      error: 'request invalid: the URL you specified does not resolve to a page that this deployment can test'
    };
  }
  // Otherwise, i.e. if the description and URL are valid:
  else {
    // Process the request.
    const {result: requestResult} = await processTestRequest(reason, {description, url});
    // Add details about the request.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': {
        description,
        URL: url
      },
      'reason why the page should be tested': reason
    };
    // Add information about the disposition of the request.
    if (requestResult === 'ok') {
      requestDisposition = {
        'what happens next': 'Your request is likely to be approved and processed within 1 hour to 1 day.',
        'how you can check for completion': 'You can call the listReports tool to learn whether the page has been tested and a report is available.',
        'how a web user can check for completion': `A web user can visit ${thisHost}/listReports.html to learn whether the page has been tested and a report is available.`
      };
    }
    else {
      const failureFact = 'Your request will not be processed, because ';
      let failureReason: string;
      if (requestResult === 'description') {
        failureReason = 'a request to test a page with the same description is already approved.'
      }
      else if (requestResult === 'url') {
        failureReason = 'a request to test a page with the same URL is already approved.'
      }
      else if (requestResult === 'retest') {
        failureReason = 'a report about a page with the same description and URL is available.'
      }
      else {
        failureReason = 'an identical request is already awaiting approval.'
      }
      requestDisposition = {
        'what happens next': `${failureFact}${failureReason}`,
        'how you can check for completion': 'Not applicable.',
        'how a web user can check for completion': 'Not applicable.'
      }
    }
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'details about your request': requestDetails,
    'disposition of your request': requestDisposition
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestTest',
    'this request': {
      description: 'Process my request to test a page about which no report is available yet. I have provided a description and the URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestTest`,
      body: {
        description,
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
      'this request': `${thisHost}/requestTestForm.html`,
      'closest ancestor request': `${thisHost}/listReports.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
