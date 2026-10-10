/*
  listPages.ts
  Returns basics about all tested pages.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {getAgoDays, getReportExtracts} from '../util.ts';
import {listPagesResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listPagesResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async () => {
  const thisHost = getThisHost();
  // Get extracts of all available reports, sorted by page description and completion time.
  const reportExtracts = await getReportExtracts();
  // Get the number of reports about each page.
  const reportCounts = new Map<string, number>();
  reportExtracts.forEach(({description}) => {
    reportCounts.set(description, (reportCounts.get(description) ?? 0) + 1);
  });
  // Initialize an array of basics about the pages.
  const pagesBasics: ResponseContent['basics about all tested pages'] = [];
  // For each report:
  reportExtracts.forEach(extract => {
    const {description, jobID, reportTime, superseded, timeStamp, url} = extract;
    // If it is the latest report about its page:
    if (!superseded) {
      // Add basics about the page, with instructions for getting details, to the array.
      pagesBasics.push({
        'tested web page': {
          description,
          URL: url
        },
        'number of reports about the page': reportCounts.get(description)!,
        'basics about the latest report': {
          identifier: `${timeStamp}-${jobID}`,
          'completion date and time': reportTime,
          'days since the report was completed': getAgoDays(new Date(reportTime))
        },
        'how to get details about the latest report': {
          method: 'GET',
          URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
        },
        'web users can get details about the latest report at': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
      });
    }
  });
  // Create the response content.
  const responseContent: ResponseContent = {
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
