/*
  getReport.ts
  Returns one report.
*/

// IMPORTS

import {z} from 'zod';
import {
  getResponseMetadata,
  getToolsFacts,
  getThisHost
} from './util.ts';
import {getReport, getReportStats} from '../util.ts';
import {getReportResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof getReportResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [reportID = ''] = args;
  const thisHost = getThisHost();
  // Get the report size. A malformed report identifier resolves to a nonexistent file
  // path, which getReportStats already reports as unavailable, so no separate syntactic
  // check is needed here.
  const reportStats = await getReportStats(reportID);
  // Create the response content.
  const responseContent: ResponseContent = reportStats
  ? {
    'size of the report in bytes': reportStats.reportSize,
    // Get the report (which may be only an error message).
    'full report': await getReport(reportID)
  }
  : {
    'size of the report in bytes': 'Error: The report could not be accessed for an unknown reason.',
    'full report': null
  };
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'getReport',
    'this request': {
      description: 'Provide one full report in JSON format. The reportID parameter identifies the report that I want details about. It was in the response to my earlier listIssues request.',
      method: 'GET',
      URL: `${thisHost}/api/getReport/${reportID}`,
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${reportID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/fullReport.json/${reportID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${reportID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
