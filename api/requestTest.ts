/*
  requestTest.ts
  Processes a request to test an untested page and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts, processTestRequest} from './util.ts';
import {getReportExtracts, isURL} from '../util.ts';
import {requestTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [what = '', url = '', reason = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const whatLength = what.length;
  // If the description is empty or too long:
  if (!whatLength || whatLength > 100) {
    requestDetails = {
      error: 'request invalid: your description of the page is not between 1 and 100 characters long'
    };
  }
  // Otherwise, i.e. if the URL is too short or too long::
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
  // Otherwise, i.e. if the description and URL are valid:
  else {
    // Get an extract of the available reports.
    const reportExtracts = await getReportExtracts();
    // If any report is on a page with the specified description and URL:
    if (
      reportExtracts.some(extract => extract.what === what && extract.url === url)
    ) {
      requestDetails = {
        error: 'request invalid: the page has already been tested and its report is available'
      };
    }
    // Otherwise, i.e. if none is on the page:
    else {
      // Process the request.
      await processTestRequest('test', what, url, reason);
      // Add details about the request.
      requestDetails = {
        'date and time received': new Date().toISOString(),
        'page to be tested': {
          description: what,
          URL: url
        },
        'reason why the page should be tested': reason
      };
      // Add information about the disposition of the request.
      requestDisposition = {
        'what happens next': 'Your request is likely to be approved and processed within 1 hour to 1 day.',
        'how you can check for completion': 'You can call the listReports tool to learn whether the page has been tested and a report is available.',
        'how a web user can check for completion': `A web user can visit ${thisHost}/listReports.html to learn whether the page has been tested and a report is available.`
      };
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
      'this request': `${thisHost}/requestTestForm.html`,
      'closest ancestor request': `${thisHost}/listReports.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
