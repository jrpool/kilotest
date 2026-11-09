/*
  listPages.ts
  Returns basics about the tested pages of one site.
*/

// IMPORTS

import {z} from 'zod';
import {getLatestReportIDs, getPageFacts, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {getRegistry, getSitePages, isSiteID} from '../registry.ts';
import {listPagesResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listPagesResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [siteID = ''] = args;
  const thisHost = getThisHost();
  const registry = await getRegistry();
  const siteName = isSiteID(siteID) ? registry.sites[siteID] : undefined;
  // Initialize the response-content properties that depend on the existence of the site.
  let siteBasics: ResponseContent['basics about the site'];
  let pagesBasics: ResponseContent['basics about all tested pages of the site'] = null;
  let howToRequest: ResponseContent['how to request a test of a page of this site not in this list'] = null;
  let howWebUserRequests: ResponseContent['how a web user can request a test of a page of this site not in this list'] = null;
  // If the site does not exist:
  if (siteName === undefined) {
    siteBasics = {error: `Site ${siteID} does not exist.`};
  }
  // Otherwise, i.e. if it exists:
  else {
    siteBasics = {identifier: siteID, name: siteName};
    const latestReportIDs = await getLatestReportIDs();
    // Get facts about its tested pages, ordered by name.
    pagesBasics = getSitePages(registry, siteID)
    .filter(([pageID]) => latestReportIDs.has(pageID))
    .map(([pageID]) => getPageFacts(registry, pageID, latestReportIDs));
    howToRequest = {
      method: 'POST',
      URL: `${thisHost}/api/requestPageTest/${siteID}`,
      'request body': {
        pageName: '1- to 120-character name of the page, distinguishing it from every other page of the site (for the home page, “home”)',
        URL: '12- to 300-character URL of the page, including the https:// scheme and any query',
        reason: '20- to 100-character reason why the page should be tested',
        reviewImmediately: 'true for immediate review, or false (the default) for review by management'
      },
      'how to check whether the request has been fulfilled': 'use this listPages tool to determine whether the page has been tested (typical wait time: 2 to 4 minutes after immediate approval, or 1 hour to 1 day under review by management)'
    };
    howWebUserRequests = {URL: `${thisHost}/requestPageTestForm.html/${siteID}`};
  }
  // Create the response content.
  const responseContent: ResponseContent = {
    'basics about the site': siteBasics,
    'how to get test results about a page': {
      method: 'GET',
      URL: `${thisHost}/api/listIssues/{identifier}`
    },
    'web users can get test results about a page at': `${thisHost}/listIssues.html/{identifier}`,
    'basics about all tested pages of the site': pagesBasics,
    'how to request a test of a page of this site not in this list': howToRequest,
    'how a web user can request a test of a page of this site not in this list': howWebUserRequests
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listPages',
    'this request': {
      description: 'Provide basics about the tested pages of one site.',
      method: 'GET',
      URL: `${thisHost}/api/listPages/${siteID}`,
      'closest ancestor request': {
        'tool name': 'listSites',
        description: 'Provide basics about all tested sites.',
        method: 'GET',
        URL: `${thisHost}/api/listSites`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listPages.html/${siteID}`,
      'closest ancestor request': `${thisHost}/listSites.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
