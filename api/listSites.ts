/*
  listSites.ts
  Returns basics about all tested sites.
*/

// IMPORTS

import {z} from 'zod';
import {getLatestReportIDs, getResponseMetadata, getSiteFacts, getThisHost, getToolsFacts} from './util.ts';
import {getRegistry} from '../registry.ts';
import {alphaCompare} from '../util.ts';
import {listSitesResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listSitesResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async () => {
  const thisHost = getThisHost();
  const registry = await getRegistry();
  const latestReportIDs = await getLatestReportIDs();
  // Get facts about the tested sites, ordered by name.
  const sitesBasics = Object.keys(registry.sites)
  .map(siteID => getSiteFacts(registry, siteID, latestReportIDs))
  .filter(site => site['count of tested pages'] > 0)
  .sort((a, b) => alphaCompare(a.name, b.name));
  // Create the response content.
  const responseContent: ResponseContent = {
    'how to list the tested pages of a site': {
      method: 'GET',
      URL: `${thisHost}/api/listPages/{identifier}`
    },
    'web users can list the tested pages of a site at': `${thisHost}/listPages.html/{identifier}`,
    'basics about all tested sites': sitesBasics,
    'how to request a test of a page of a site not in this list': {
      method: 'POST',
      URL: `${thisHost}/api/requestNewTest`,
      'request body': {
        siteName: '1- to 80-character name of the site, usually the name of the organization or brand that presents it',
        pageName: '1- to 120-character name of the page, distinguishing it from every other page of the site (for the home page, “home”)',
        URL: '12- to 300-character URL of the page, including the https:// scheme and any query',
        reason: '20- to 100-character reason why the page should be tested',
        reviewImmediately: 'true for immediate review, or false (the default) for review by management'
      },
      'how to check whether the request has been fulfilled': 'use this listSites tool to determine whether the site has been tested (typical wait time: 2 to 4 minutes after immediate approval, or 1 hour to 1 day under review by management)'
    },
    'how a web user can request a test of a page of a site not in this list': {
      URL: `${thisHost}/requestNewTestForm.html`
    }
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listSites',
    'this request': {
      description: 'Provide basics about all tested sites.',
      method: 'GET',
      URL: `${thisHost}/api/listSites`,
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listSites.html`,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
