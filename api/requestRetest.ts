/*
  requestRetest.ts
  Processes a request to retest a page and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {processTestRequest} from '../util.ts';
import {requestRetestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestRetestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [timeStamp = '', jobID = '', reason = ''] = args;
  const thisHost = getThisHost();
  const reasonLength = reason.length;
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  // If the encoded reason is too short or too long:
  if (reasonLength < 20 || reasonLength > 100) {
    requestDetails = {
      error: 'request invalid: your reason is not between 20 and 100 characters long'
    }
  }
  // Otherwise, i.e. if the request is facially valid:
  else {
    // Process the request. This resolves the cited report's description and URL itself.
    const processResult = await processTestRequest(reason, {timeStamp, jobID});
    // If the cited report does not exist:
    if (processResult.result === 'nonreport') {
      requestDetails = {
        error: 'request invalid: the specified report does not exist'
      };
    }
    // Otherwise, i.e. if the cited report was found:
    else {
      const {result: requestResult, description, url} = processResult;
      // Add details about the request.
      requestDetails = {
        'date and time received': new Date().toISOString(),
        'page to be retested': {
          'description': description,
          'URL': url
        },
        'reason why the page should be retested': reason
      };
      // Add information about the disposition of the request.
      if (requestResult === 'ok') {
        requestDisposition = {
          'what happens next': 'Your request is likely to be approved and processed within 1 hour to 1 day.',
          'how you can check for completion': 'You can call the listReports tool to learn whether the page has been retested and a new report is available.',
          'how a web user can check for completion': `A web user can visit ${thisHost}/listReports.html to learn whether the page has been retested and a new report is available.`
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
        else if (requestResult === 'superseded') {
          failureReason = 'a later report about a page with the same description is available.'
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
