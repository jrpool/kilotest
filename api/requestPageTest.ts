/*
  requestPageTest.ts
  Processes a request to test a page not yet tested of a registered site, and returns an acknowledgement. The reviewImmediately flag selects the review path: immediate review with immediate enqueueing if approved (true), or the management-approval queue (false or omitted).
*/

// IMPORTS

import {z} from 'zod';
import {buildSubmissionDisposition, checkNewPage, getResponseMetadata, getThisHost, getToolsFacts, viewPage} from './util.ts';
import {isSiteID} from '../registry.ts';
import {normalizeSpace, submitTestRequest} from '../requests.ts';
import type {SubmitResult} from '../requests.ts';
import {requestPageTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestPageTestResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [siteID = '', rawPageName = '', url = '', reason = '', review = ''] = args;
  const pageName = normalizeSpace(rawPageName);
  const reviewImmediately = review === 'true';
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const check = isSiteID(siteID)
    ? await checkNewPage({pageName, url, reason})
    : {error: 'request invalid: the siteID is malformed'};
  // If the request is invalid:
  if ('error' in check) {
    requestDetails = {error: check.error};
  }
  // Otherwise, i.e. if the request is valid:
  else {
    // Submit it.
    const result = await submitTestRequest({
      target: {siteID, pageName, url}, reason, reviewImmediately, finalURL: check.finalURL
    }) as Exclude<SubmitResult, {result: 'nonreport'}>;
    // Add details about the request.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': viewPage('page' in result ? result.page : {
        siteID, siteName: '', pageID: null, pageName, url
      }),
      'reason why the page should be tested': reason
    };
    // Add information about the disposition of the request.
    requestDisposition = await buildSubmissionDisposition(result, {
      howToCheck: `You can call the listPages tool with siteID "${siteID}" to learn whether the page has been tested.`,
      howWebUserChecks: `A web user can visit ${thisHost}/listPages.html/${siteID} to learn whether the page has been tested.`
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
    'tool name': 'requestPageTest',
    'this request': {
      description: 'Process my request to test a page of a site that is in the listSites output. The siteID parameter identifies the site. I have provided the name and URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestPageTest/${siteID}`,
      body: {
        pageName: rawPageName,
        URL: url,
        reason,
        reviewImmediately
      },
      'closest ancestor request': {
        'tool name': 'listPages',
        description: 'Provide basics about the tested pages of one site.',
        method: 'GET',
        URL: `${thisHost}/api/listPages/${siteID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestPageTestForm.html/${siteID}`,
      'closest ancestor request': `${thisHost}/listPages.html/${siteID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
