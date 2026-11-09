/*
  requestNewTest.ts
  Processes a request to test a page not yet tested, of either a site in the listSites output (identified by siteID) or a site not yet tested (named by siteName), and returns an acknowledgement. The reviewImmediately flag selects the review path: immediate review with immediate enqueueing if approved (true), or the management-approval queue (false or omitted).
*/

// IMPORTS

import {z} from 'zod';
import {buildSubmissionDisposition, checkNewPage, getResponseMetadata, getThisHost, getToolsFacts, viewPage} from './util.ts';
import {isSiteID} from '../registry.ts';
import {normalizeSpace, submitTestRequest} from '../requests.ts';
import type {SubmitResult} from '../requests.ts';
import {requestNewTestResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestNewTestResponseSchema>['response content'];

// FUNCTIONS

// Returns why the site of a request is invalid, or null if it is valid.
const checkSite = (siteID: string, siteName: string): string | null => {
  // If both or neither of the site identifier and the site name are given:
  if (Boolean(siteID) === Boolean(siteName)) {
    return 'request invalid: give exactly one of siteID (for a site in the listSites output) and siteName (for another site)';
  }
  // If the site identifier is malformed:
  if (siteID && !isSiteID(siteID)) {
    return 'request invalid: the siteID is malformed';
  }
  return null;
};
// Returns the response body. The arguments are the site identifier, the site name, the page name, the URL, the reason, and whether to review the request immediately; an empty site identifier or site name is absent.
export const response = async (args: string[]) => {
  const [siteID = '', rawSiteName = '', rawPageName = '', url = '', reason = '', review = ''] = args;
  const siteName = normalizeSpace(rawSiteName);
  const pageName = normalizeSpace(rawPageName);
  const reviewImmediately = review === 'true';
  const thisHost = getThisHost();
  // Initialize the response-content properties.
  let requestDetails: ResponseContent['details about your request'];
  let requestDisposition: ResponseContent['disposition of your request'] = null;
  const siteError = checkSite(siteID, siteName);
  const check = siteError
    ? {error: siteError}
    : await checkNewPage({...(siteName ? {siteName} : {}), pageName, url, reason});
  // If the request is invalid:
  if ('error' in check) {
    requestDetails = {error: check.error};
  }
  // Otherwise, i.e. if the request is valid:
  else {
    // Submit it.
    const result = await submitTestRequest({
      target: siteID ? {siteID, pageName, url} : {siteName, pageName, url},
      reason,
      reviewImmediately,
      finalURL: check.finalURL
    }) as Exclude<SubmitResult, {result: 'nonreport'}>;
    // Add details about the request.
    requestDetails = {
      'date and time received': new Date().toISOString(),
      'page to be tested': viewPage('page' in result ? result.page : {
        siteID: siteID || null, siteName, pageID: null, pageName, url
      }),
      'reason why the page should be tested': reason
    };
    // Add information about the disposition of the request.
    requestDisposition = await buildSubmissionDisposition(result, siteID ? {
      howToCheck: `You can call the listPages tool with siteID "${siteID}" to learn whether the page has been tested.`,
      howWebUserChecks: `A web user can visit ${thisHost}/listPages.html/${siteID} to learn whether the page has been tested.`
    } : {
      howToCheck: 'You can call the listSites tool to learn whether the site has been tested, and then the listPages tool with its identifier to find the page.',
      howWebUserChecks: `A web user can visit ${thisHost}/listSites.html to learn whether the site has been tested.`
    });
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'details about your request': requestDetails,
    'disposition of your request': requestDisposition
  };
  // Create a response body. Its closest ancestor is the listing of the tested pages of the identified site, or else the listing of the tested sites.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestNewTest',
    'this request': {
      description: 'Process my request to test a page that has not been tested. I have identified its site by siteID if the site is in the listSites output, or else named its site by siteName, and I have provided the name and URL of the page and a reason why it should be tested.',
      method: 'POST',
      URL: `${thisHost}/api/requestNewTest`,
      body: {
        ...(siteID ? {siteID} : {}),
        ...(rawSiteName ? {siteName: rawSiteName} : {}),
        pageName: rawPageName,
        URL: url,
        reason,
        reviewImmediately
      },
      'closest ancestor request': siteID ? {
        'tool name': 'listPages',
        description: 'Provide basics about the tested pages of one site.',
        method: 'GET',
        URL: `${thisHost}/api/listPages/${siteID}`
      } : {
        'tool name': 'listSites',
        description: 'Provide basics about all tested sites.',
        method: 'GET',
        URL: `${thisHost}/api/listSites`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/requestNewTestForm.html${siteID ? `/${siteID}` : ''}`,
      'closest ancestor request': siteID ? `${thisHost}/listPages.html/${siteID}` : `${thisHost}/listSites.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
