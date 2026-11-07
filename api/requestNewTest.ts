/*
  requestNewTest.ts
  Processes a request to test an untested page and returns an acknowledgement. The
  immediateAutomatedReview flag selects the review path: automated review with immediate
  enqueueing if approved (true), or the manager-approval queue (false or omitted).
*/

// IMPORTS

import {z} from 'zod';
import {buildRequestDisposition, getRequestFailureReason, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {checkLength, isAllowedRedirectTarget, isAllowedTarget, isURL, orderJob, processTestRequest} from '../util.ts';
import {requestNewTestResponseSchema} from './schemas.ts';
import {sendAlert} from '../alerts.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestNewTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [description = '', url = '', reason = '', review = ''] = args;
  const immediateAutomatedReview = review === 'true';
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const descriptionCheck = checkLength(description, 1, 100, 'description of the page');
  const reasonCheck = checkLength(reason, 20, 100, 'reason');
  // If the description is invalid:
  if (descriptionCheck.status === 'error') {
    requestDetails = {
      error: `request invalid: your ${descriptionCheck.message}`
    };
  }
  // Otherwise, if the reason is too short or too long:
  else if (reasonCheck.status === 'error') {
    requestDetails = {
      error: `request invalid: your ${reasonCheck.message}`
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
  // Otherwise, i.e. if the URL redirects to a target this deployment does not allow:
  else if (!(await isAllowedRedirectTarget(url))) {
    requestDetails = {
      error: 'request invalid: the URL you specified does not resolve to a page that this deployment can test'
    };
    // Alert a manager, since a redirect to a disallowed target on a request that
    // itself named an allowed hostname suggests an attempted or accidental SSRF,
    // rather than an ordinary mistake by a legitimate submitter.
    await sendAlert(
      'Kilotest: request rejected for redirecting to a disallowed target',
      `A request to test ${url} (described as "${description}") was rejected because it redirects to a target this deployment does not allow (e.g. a private, loopback, or link-local address).`
    );
  }
  // Otherwise, i.e. if the description, reason, and URL are valid:
  else {
    // Add details about the request.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': {
        description,
        URL: url
      },
      'reason why the page should be tested': reason
    };
    // If automated review was requested, order the test: enqueue the job directly, with no
    // manual-approval step, gated only by the lightweight checks orderJob itself performs
    // (the target is not already claimed, queued, or reported, and the job queue is not
    // already full).
    if (immediateAutomatedReview) {
      const orderResult = await orderJob({description, url}, reason);
      // Add information about the disposition of the request.
      if (orderResult.result === 'ok') {
        requestDisposition = {
          'what happens next': 'Testing has begun. Once it finishes, the report will be available via the listIssues tool.',
          'report identifier': orderResult.reportID,
          'how you can check for completion': `Call the listIssues tool with reportID "${orderResult.reportID}" to learn whether the report is ready.`,
          'do you want to wait for completion': 'Testing typically takes 2 to 4 minutes. Do you want to wait (and be notified of completion) instead of checking back later? If so, call the awaitTest tool with the same reportID.'
        };
      }
      else {
        requestDisposition = {
          'what happens next': `Your request will not be processed, because ${getRequestFailureReason(
            orderResult.result,
            {result: 'reportExists', reason: 'a report about a page with the same description or URL is available.'}
          )}`,
          'report identifier': null,
          'how you can check for completion': 'Not applicable.',
          'do you want to wait for completion': 'Not applicable.'
        };
      }
    }
    // Otherwise, i.e. if manager review was requested or defaulted:
    else {
      // Process the request.
      const {result: requestResult} = await processTestRequest(reason, {description, url});
      // Add information about the disposition of the request.
      requestDisposition = buildRequestDisposition(
        requestResult,
        {
          whatHappensNext: 'Your request is likely to be approved and processed within 1 hour to 1 day.',
          howToCheck: 'You can call the listPages tool to learn whether the page has been tested.',
          howWebUserChecks: `A web user can visit ${thisHost}/listPages.html to learn whether the page has been tested.`
        },
        {result: 'reportExists', reason: 'a report about a page with the same description or URL is available.'}
      );
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
    'tool name': 'requestNewTest',
    'this request': {
      description: 'Process my request to test a page about which no report is available yet. I have provided a description and the URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestNewTest`,
      body: {
        description,
        URL: url,
        reason,
        immediateAutomatedReview
      },
      'closest ancestor request': {
        'tool name': 'listPages',
        description: 'Provide basics about all tested pages.',
        method: 'GET',
        URL: `${thisHost}/api/listPages`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestNewTestForm.html`,
      'closest ancestor request': `${thisHost}/listPages.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
