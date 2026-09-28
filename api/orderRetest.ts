/*
  orderRetest.ts
  Processes an order to retest a page immediately, without manual approval, and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getRequestFailureReason, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {checkLength, isJobID, isTimeStamp, orderJob} from '../util.ts';
import {orderRetestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof orderRetestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [timeStamp = '', jobID = '', reason = ''] = args;
  const thisHost = getThisHost();
  const reasonCheck = checkLength(reason, 20, 100, 'reason');
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your order'];
  let requestDisposition: ResponseContent['disposition of your order'] = null;
  // If the timestamp or job ID is not syntactically valid:
  if (!isTimeStamp(timeStamp) || !isJobID(jobID)) {
    requestDetails = {
      error: 'order invalid: the report timestamp or job identifier is malformed'
    };
  }
  // Otherwise, if the encoded reason is too short or too long:
  else if (reasonCheck.status === 'error') {
    requestDetails = {
      error: `order invalid: your ${reasonCheck.message}`
    };
  }
  // Otherwise, i.e. if the order is facially valid:
  else {
    // Order the retest. Unlike processTestRequest, this enqueues the job directly, with
    // no manual-approval step, gated only by the lightweight checks orderJob itself
    // performs (the target is not already claimed or queued, and the job queue is not
    // already full). This resolves the cited report's description and URL itself.
    const orderResult = await orderJob({timeStamp, jobID}, reason);
    // If the cited report does not exist:
    if (orderResult.result === 'nonreport') {
      requestDetails = {
        error: 'order invalid: the specified report does not exist'
      };
    }
    // Otherwise, i.e. if the cited report was found:
    else {
      // Add details about the order.
      requestDetails = {
        'date and time received': new Date().toISOString(),
        'page to be retested': {
          description: orderResult.description,
          URL: orderResult.url
        },
        'reason why the page should be retested': reason
      };
      // Add information about the disposition of the order.
      if (orderResult.result === 'ok') {
        const [reportTimeStamp, reportJobID] = orderResult.jobID.split('-') as [string, string];
        requestDisposition = {
          'what happens next': 'Testing has begun. Once it finishes, the report will be available via the listIssues tool.',
          'report identifier': {timeStamp: reportTimeStamp, jobID: reportJobID},
          'how you can check for completion': `Call the listIssues tool with timeStamp "${reportTimeStamp}" and jobID "${reportJobID}" to learn whether the report is ready.`,
          'do you want to wait for completion': 'Testing typically takes about 2 minutes and occasionally up to 4 minutes. Do you want to wait (and be notified of completion) instead of checking back later? If so, call the awaitTest tool with the same timeStamp and jobID.'
        };
      }
      else {
        requestDisposition = {
          'what happens next': `Your order will not be processed, because ${getRequestFailureReason(
            orderResult.result,
            {result: 'superseded', reason: 'a later report about a page with the same description is available.'}
          )}`,
          'report identifier': null,
          'how you can check for completion': 'Not applicable.',
          'do you want to wait for completion': 'Not applicable.'
        };
      }
    }
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'details about your order': requestDetails,
    'disposition of your order': requestDisposition
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'orderRetest',
    'this request': {
      description: 'Process my order to retest a page, immediately and without manual approval. The timeStamp and jobID parameters identify the latest available report about the page. Those parameters were in the response to my earlier listIssues request. The reason property of the request body is the reason why the page should be retested.',
      method: 'POST',
      URL: `${thisHost}/api/orderRetest/${timeStamp}/${jobID}`,
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
      'this request': null,
      'closest ancestor request': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
