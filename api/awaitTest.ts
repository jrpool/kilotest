/*
  awaitTest.ts
  Waits for a job ordered via orderTest or orderRetest to complete, and returns its outcome.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {awaitJob, isJobID, isTimeStamp} from '../util.ts';
import {awaitTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof awaitTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [timeStamp = '', jobID = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your wait'];
  let requestDisposition: ResponseContent['disposition of your wait'] = null;
  // If the timestamp or job ID is not syntactically valid:
  if (!isTimeStamp(timeStamp) || !isJobID(jobID)) {
    requestDetails = {
      error: 'wait invalid: the report timestamp or job identifier is malformed'
    };
  }
  // Otherwise, i.e. if the identifier is syntactically valid:
  else {
    requestDetails = {
      'report identifier': {timeStamp, jobID}
    };
    // Wait for the job to complete, fail, or time out. No progress notices are sent
    // during this wait; the caller receives only this one, final response.
    const outcome = await awaitJob(timeStamp, jobID);
    if (outcome === 'notFound') {
      requestDetails = {
        error: `wait invalid: no report with timeStamp "${timeStamp}" and jobID "${jobID}" is completed, pending, or in progress`
      };
    }
    else if (outcome === 'completed') {
      requestDisposition = {
        outcome: 'completed',
        'what happened': 'The report is ready.',
        'how you can check for completion': `Call the listIssues tool with timeStamp "${timeStamp}" and jobID "${jobID}" to retrieve the report.`
      };
    }
    else if (outcome === 'failed') {
      requestDisposition = {
        outcome: 'failed',
        'what happened': 'The job failed and no report will be produced.',
        'how you can check for completion': 'Not applicable.'
      };
    }
    else {
      requestDisposition = {
        outcome: 'timedOut',
        'what happened': 'The job has not completed within the maximum wait time, but it may still be running.',
        'how you can check for completion': `Call the listIssues tool with timeStamp "${timeStamp}" and jobID "${jobID}" after a few minutes to check whether the report is ready.`
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
      description: 'Wait for a job ordered via the orderTest or orderRetest tool to complete. The timeStamp and jobID parameters are the report identifier that orderTest or orderRetest returned. This call blocks until the report is ready, the job fails, or a maximum wait time elapses.',
      method: 'POST',
      URL: `${thisHost}/api/awaitTest/${timeStamp}/${jobID}`,
      // awaitTest's own parameters do not say whether the job was ordered via orderTest
      // or orderRetest, so both are reported as possible ancestors, rather than
      // arbitrarily naming just one.
      'closest ancestor request': [
        {
          'tool name': 'orderTest',
          description: 'Process my order to test a page about which no report is available yet, immediately and without manual approval.',
          method: 'POST',
          URL: `${thisHost}/api/orderTest`
        },
        {
          'tool name': 'orderRetest',
          description: 'Process my order to retest a page, immediately and without manual approval.',
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
