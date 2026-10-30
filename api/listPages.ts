/*
  listPages.ts
  Returns basics about all tested pages.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {getReportExtracts} from '../util.ts';
import {listPagesResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listPagesResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async () => {
  const thisHost = getThisHost();
  // Get extracts of the latest reports about all tested pages, sorted by page description.
  const reportExtracts = await getReportExtracts(true);
  // Get the basics about each tested page: its description, URL, and the identifier of
  // its latest report, which the result-retrieval instructions below use as a placeholder.
  const pagesBasics: ResponseContent['basics about all tested pages'] = reportExtracts.map(
    ({description, id, url}) => ({description, URL: url, identifier: id})
  );
  // Create the response content.
  const responseContent: ResponseContent = {
    'how to get test results about a page': {
      method: 'GET',
      URL: `${thisHost}/api/listIssues/{identifier}`
    },
    'web users can get test results about a page at': `${thisHost}/listIssues.html/{identifier}`,
    'basics about all tested pages': pagesBasics,
    'how to request that a page with no report be tested': {
      method: 'POST',
      URL: `${thisHost}/api/requestNewTest`,
      'request body': {
        description: '10- to 100-character description of the page conforming to the naming convention used in this list of pages',
        URL: '12- to 300-character URL of the page, including the https:// scheme and any query',
        reason: '20- to 100-character reason why the page should be tested'
      },
      'how to check whether the request has been fulfilled': 'use this listPages tool to determine whether the page has been tested (typical wait time: 1 hour to 1 day)'
    },
    'how a web user can request that the page be tested': {
      URL: `${thisHost}/requestNewTestForm.html`
    }
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listPages',
    'this request': {
      description: 'Provide basics about all tested pages.',
      method: 'GET',
      URL: `${thisHost}/api/listPages`,
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listPages.html`,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
