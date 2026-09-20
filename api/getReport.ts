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
  const [timeStamp = '', jobID = ''] = args;
  const thisHost = getThisHost();
  // Get the report size. A malformed timestamp or job ID resolves to a nonexistent file
  // path, which getReportStats already reports as unavailable, so no separate syntactic
  // check is needed here.
  const reportStats = await getReportStats(timeStamp, jobID);
  // Create the response content.
  const responseContent: ResponseContent = reportStats
  ? {
    'size of the report in bytes': reportStats.reportSize,
    // Get the report (which may be only an error message).
    'full report': await getReport(timeStamp, jobID)
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
      description: 'Provide one full report in JSON format. The timeStamp and jobID parameters identify the report that I want details about. Those parameters were in the response to my earlier listIssues request.',
      method: 'GET',
      URL: `${thisHost}/api/getReport/${timeStamp}/${jobID}`,
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it.',
        method: 'GET',
        URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`,
      'closest ancestor request': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
