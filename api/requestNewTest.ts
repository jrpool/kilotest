/*
  requestNewTest.ts
  Processes a request to test a page of a site that is not yet registered, and returns an acknowledgement. The reviewImmediately flag selects the review path: immediate review with immediate enqueueing if approved (true), or the management-approval queue (false or omitted).
*/

// IMPORTS

import {z} from 'zod';
import {buildSubmissionDisposition, checkNewPage, getResponseMetadata, getThisHost, getToolsFacts, viewPage} from './util.ts';
import {normalizeSpace, submitTestRequest} from '../requests.ts';
import type {SubmitResult} from '../requests.ts';
import {requestNewTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestNewTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [rawSiteName = '', rawPageName = '', url = '', reason = '', review = ''] = args;
  const siteName = normalizeSpace(rawSiteName);
  const pageName = normalizeSpace(rawPageName);
  const reviewImmediately = review === 'true';
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const check = await checkNewPage({siteName, pageName, url, reason});
  // If the request is invalid:
  if ('error' in check) {
    requestDetails = {error: check.error};
  }
  // Otherwise, i.e. if the request is valid:
  else {
    // Submit it.
    const result = await submitTestRequest({
      target: {siteName, pageName, url}, reason, reviewImmediately, finalURL: check.finalURL
    }) as Exclude<SubmitResult, {result: 'nonreport'}>;
    // Add details about the request.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': viewPage('page' in result ? result.page : {
        siteID: null, siteName, pageID: null, pageName, url
      }),
      'reason why the page should be tested': reason
    };
    // Add information about the disposition of the request.
    requestDisposition = await buildSubmissionDisposition(result, {
      howToCheck: 'You can call the listSites tool to learn whether the site has been tested, and then the listPages tool with its identifier to find the page.',
      howWebUserChecks: `A web user can visit ${thisHost}/listSites.html to learn whether the site has been tested.`
    });
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
      description: 'Process my request to test a page of a site that is not in the listSites output. I have provided the names of the site and the page, the URL of the page, and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestNewTest`,
      body: {
        siteName: rawSiteName,
        pageName: rawPageName,
        URL: url,
        reason,
        reviewImmediately
      },
      'closest ancestor request': {
        'tool name': 'listSites',
        description: 'Provide basics about all tested sites.',
        method: 'GET',
        URL: `${thisHost}/api/listSites`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestNewTestForm.html`,
      'closest ancestor request': `${thisHost}/listSites.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
