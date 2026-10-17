/*
  awaitTest.ts
  Waits for a job ordered via orderNewTest or orderRetest to complete, and returns its outcome.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {awaitJob, isReportID} from '../util.ts';
import {awaitTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof awaitTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [reportID = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your wait'];
  let requestDisposition: ResponseContent['disposition of your wait'] = null;
  // If the report identifier is not syntactically valid:
  if (!isReportID(reportID)) {
    requestDetails = {
      error: 'wait invalid: the reportID is malformed'
    };
  }
  // Otherwise, i.e. if the identifier is syntactically valid:
  else {
    requestDetails = {
      'report identifier': reportID
    };
    // Wait for the job to complete, fail, or time out. No progress notices are sent
    // during this wait; the caller receives only this one, final response.
    const outcome = await awaitJob(reportID);
    if (outcome === 'notFound') {
      requestDetails = {
        error: `wait invalid: no report with identifier "${reportID}" is completed, pending, or in progress`
      };
    }
    else if (outcome === 'completed') {
      requestDisposition = {
        outcome: 'completed',
        'what happened': 'The report is ready.',
        'how you can check for completion': `Call the listIssues tool with reportID "${reportID}" to retrieve the report.`
      };
    }
    else if (outcome === 'failed') {
      requestDisposition = {
        outcome: 'failed',
        'what happened': 'The job failed, so no report will be produced.',
        'how you can check for completion': 'Not applicable.'
      };
    }
    else {
      requestDisposition = {
        outcome: 'timedOut',
        'what happened': 'The job was not completed within the maximum wait time, but it may still be running.',
        'how you can check for completion': `Call the listIssues tool with reportID "${reportID}" after a few minutes to check whether the report is ready.`
      };
    }
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'details about your wait': requestDetails,
    'disposition of your wait': requestDisposition
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'awaitTest',
    'this request': {
      description: 'Wait for a job ordered via the orderNewTest or orderRetest tool to complete. The reportID parameter is the report identifier that orderNewTest or orderRetest returned. This call blocks until the report is ready, the job fails, or a maximum wait time elapses.',
      method: 'POST',
      URL: `${thisHost}/api/awaitTest/${reportID}`,
      // awaitTest's own parameters do not say whether the job was ordered via orderNewTest
      // or orderRetest, so both are reported as possible ancestors, rather than
      // arbitrarily naming just one.
      'closest ancestor request': [
        {
          'tool name': 'orderNewTest',
          description: 'Fulfill or reject my order to test a page about which no report is available yet.',
          method: 'POST',
          URL: `${thisHost}/api/orderNewTest`
        },
        {
          'tool name': 'orderRetest',
          description: 'Fulfill or reject my order to retest a page.',
          method: 'POST',
          URL: `${thisHost}/api/orderRetest`
        }
      ]
    },
    'URLs of similar requests for web users': {
      'this request': null,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
