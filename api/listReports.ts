/*
  listReports.ts
  Returns basics about all the available reports.
*/

// IMPORTS

import {z} from 'zod';
import {getReportBasics, getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {getReportExtracts} from '../util.ts';
import {listReportsResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listReportsResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async () => {
  const thisHost = getThisHost();
  // Initialize an array of basics about the reports.
  const reportsBasics: ResponseContent['basics about all available reports'] = [];
  // Get extracts of all available reports.
  const reportExtracts = await getReportExtracts();
  // For each report:
  for (const extract of reportExtracts) {
    const {jobID, timeStamp} = extract;
    // Get the basics about it.
    const reportBasics = await getReportBasics(timeStamp, jobID, extract);
    // Add the basics, with instructions for getting details, to the array.
    reportsBasics.push({
      ...reportBasics,
      'how to get details about the report': {
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      },
      'web users can get details about the report at': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
    });
  }
  // Sort the array by page description and secondarily by completion recency.
  reportsBasics.sort((a, b) => {
    if (a['tested web page'].description !== b['tested web page'].description) {
      return a['tested web page']
      .description
      .localeCompare(b['tested web page'].description, 'en', {sensitivity: 'base'});
    }
    return a['completion date and time'].localeCompare(b['completion date and time']);
  });
  // Create the response content.
  const responseContent: ResponseContent = {
    'basics about all available reports': reportsBasics,
    'how to request that a page with no report be tested': {
      method: 'POST',
      URL: `${thisHost}/api/requestTest`,
      'request body': {
        description: '10- to 100-character description of the page conforming to the naming convention used in this list of reports',
        URL: '12- to 300-character URL of the page, including the https:// scheme and any query',
        reason: '20- to 100-character reason why the page should be tested'
      },
      'how to check whether the request has been fulfilled': 'use this listReports tool to determine whether a report about the page has become available (typical wait time: 1 hour to 1 day)'
    },
    'how a web user can request that the page be tested': {
      URL: `${thisHost}/requestTestForm.html`
    }
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listReports',
    'this request': {
      description: 'Provide basics about all available reports.',
      method: 'GET',
      URL: `${thisHost}/api/listReports`,
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listReports.html`,
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
