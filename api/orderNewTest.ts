/*
  orderNewTest.ts
  Processes an order to test an untested page immediately, without manual approval, and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getRequestFailureReason, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {checkLength, isAllowedRedirectTarget, isAllowedTarget, isURL, orderJob} from '../util.ts';
import {orderNewTestResponseSchema} from './schemas.ts';
import {sendAlert} from '../alerts.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof orderNewTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [description = '', url = '', reason = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your order'];
  let requestDisposition: ResponseContent['disposition of your order'] = null;
  const descriptionCheck = checkLength(description, 1, 100, 'description of the page');
  const reasonCheck = checkLength(reason, 20, 100, 'reason');
  // If the description is invalid:
  if (descriptionCheck.status === 'error') {
    requestDetails = {
      error: `order invalid: your ${descriptionCheck.message}`
    };
  }
  // Otherwise, if the reason is too short or too long:
  else if (reasonCheck.status === 'error') {
    requestDetails = {
      error: `order invalid: your ${reasonCheck.message}`
    };
  }
  // Otherwise, i.e. if the URL is too short or too long:
  else if (url.length < 12 || url.length > 300) {
    requestDetails = {
      error: 'order invalid: you specified a URL for the page that is not between 12 and 300 characters long'
    };
  }
  // Otherwise, i.e. if the URL is invalid:
  else if (!isURL(url)) {
    requestDetails = {
      error: 'order invalid: you specified an invalid URL for the page'
    };
  }
  // Otherwise, i.e. if the URL does not resolve to an allowed target:
  else if (!(await isAllowedTarget(url))) {
    requestDetails = {
      error: 'order invalid: the URL you specified does not resolve to a page that this deployment can test'
    };
  }
  // Otherwise, i.e. if the URL redirects to a target this deployment does not allow:
  else if (!(await isAllowedRedirectTarget(url))) {
    requestDetails = {
      error: 'order invalid: the URL you specified does not resolve to a page that this deployment can test'
    };
    // Alert a manager, since a redirect to a disallowed target on an order that
    // itself named an allowed hostname suggests an attempted or accidental SSRF,
    // rather than an ordinary mistake by a legitimate submitter.
    await sendAlert(
      'Kilotest: instant-test order rejected for redirecting to a disallowed target',
      `An order to test ${url} (described as "${description}") was rejected because it redirects to a target this deployment does not allow (e.g. a private, loopback, or link-local address).`
    );
  }
  // Otherwise, i.e. if the description and URL are valid:
  else {
    // Order the test. Unlike processTestRequest, this enqueues the job directly, with no
    // manual-approval step, gated only by the lightweight checks orderJob itself performs
    // (the target is not already claimed, queued, or reported, and the job queue is not
    // already full).
    const orderResult = await orderJob({description, url}, reason);
    // Add details about the order.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': {
        description,
        URL: url
      },
      'reason why the page should be tested': reason
    };
    // Add information about the disposition of the order.
    if (orderResult.result === 'ok') {
      const [timeStamp, reportJobID] = orderResult.jobID.split('-') as [string, string];
      requestDisposition = {
        'what happens next': 'Testing has begun. Once it finishes, the report will be available via the listIssues tool.',
        'report identifier': {timeStamp, jobID: reportJobID},
        'how you can check for completion': `Call the listIssues tool with timeStamp "${timeStamp}" and jobID "${reportJobID}" to learn whether the report is ready.`,
        'do you want to wait for completion': 'Testing typically takes about 2 minutes and occasionally up to 4 minutes. Do you want to wait (and be notified of completion) instead of checking back later? If so, call the awaitTest tool with the same timeStamp and jobID.'
      };
    }
    else {
      requestDisposition = {
        'what happens next': `Your order will not be processed, because ${getRequestFailureReason(
          orderResult.result,
          {result: 'reportExists', reason: 'a report about a page with the same description or URL is available.'}
        )}`,
        'report identifier': null,
        'how you can check for completion': 'Not applicable.',
        'do you want to wait for completion': 'Not applicable.'
      };
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
    'tool name': 'orderNewTest',
    'this request': {
      description: 'Process my order to test a page about which no report is available yet, immediately and without manual approval. I have provided a description and the URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/orderNewTest`,
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
      'this request': null,
      'closest ancestor request': `${thisHost}/listReports.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
