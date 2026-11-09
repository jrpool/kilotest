/*
  requestRetest.ts
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {buildSubmissionDisposition, getResponseMetadata, getThisHost, getToolsFacts, viewPage} from './util.ts';
import {checkLength, isReportID} from '../util.ts';
import {submitTestRequest} from '../requests.ts';
import {requestRetestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestRetestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [reportID = '', reason = '', review = ''] = args;
  const reviewImmediately = review === 'true';
  const thisHost = getThisHost();
  const reasonCheck = checkLength(reason, 20, 100, 'reason');
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  // If the report identifier is not syntactically valid:
  if (!isReportID(reportID)) {
    requestDetails = {
      error: 'request invalid: the reportID is malformed'
    };
  }
  // Otherwise, if the reason is too short or too long:
  else if (reasonCheck.status === 'error') {
    requestDetails = {
      error: `request invalid: ${reasonCheck.message.replace(/^The/, 'the')}`
    };
  }
  // Otherwise, i.e. if the request is facially valid:
  else {
    // Submit it. Its page and URL are those of the cited report’s page in the registry.
    const result = await submitTestRequest({target: {reportID}, reason, reviewImmediately});
    // If the cited report or its page does not exist:
    if (!('page' in result)) {
      requestDetails = {
        error: 'request invalid: the specified report does not exist or is not about a registered page'
      };
    }
    // Otherwise, i.e. if the cited report and its page were found:
    else {
      // Add details about the request.
      requestDetails = {
        'date and time received': new Date().toISOString(),
        'page to be retested': viewPage(result.page),
        'reason why the page should be retested': reason
      };
      // Add information about the disposition of the request.
      requestDisposition = await buildSubmissionDisposition(result, {
        howToCheck: `You can call the listIssues tool with reportID "${reportID}" to learn whether a later report about the page is available.`,
        howWebUserChecks: `A web user can visit ${thisHost}/listIssues.html/${reportID} to learn whether a later report about the page is available.`
      });
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
    'tool name': 'requestRetest',
    'this request': {
      description: 'Process my request to retest a page. The reportID parameter identifies the latest available report about the page. It was in the response to my earlier listIssues request. The reason property of the request body is the reason why the page should be retested.',
      method: 'POST',
      URL: `${thisHost}/api/requestRetest/${reportID}`,
      body: {
        reason,
        reviewImmediately
      },
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${reportID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestRetestForm.html/${reportID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${reportID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
