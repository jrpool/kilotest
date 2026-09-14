/*
  index.ts
  Serves a form for hiding a report.
*/

// IMPORTS

import {getReportExtracts, hiddenReportsPath, populateTemplate, reportsPath} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Returns a form for hiding a report.
export const answer = async (_: any, search: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobName = searchParams?.get('report');
  // If the form has been displayed by itself after a submission and a report is to be hidden:
  if (jobName) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
      const fileName = `${jobName}.json`;
      try {
        // Move the specified report to the directory of hidden reports.
        await fs.rename(path.join(reportsPath(), fileName), path.join(hiddenReportsPath(), fileName));
      }
      // If this failed:
      catch (error: any) {
        // Return why.
        return {
          status: 'error',
          message: `Hiding report ${jobName} failed (${error.message})`
        };
      }
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error.
      return {
        status: 'error',
        message: 'Invalid authorization code'
      }
    }
  }
  // Initialize an array of report specifications.
  const reportSpecs: any[] = [];
  // Get data on all available reports.
  const reportExtracts = await getReportExtracts();
  // For each report:
  for (const reportExtract of reportExtracts) {
    const {jobID, timeStamp, description} = reportExtract;
    // Add the report to the array.
    reportSpecs.push({
      description,
      timeStamp,
      jobID
    });
  }
  // Sort the data by page name and then by time stamp.
  reportSpecs.sort((a, b) => {
    if (a.description === b.description) {
      return a.timeStamp.localeCompare(b.timeStamp);
    }
    return a.description.localeCompare(b.description);
  });
  const lines: string[] = [];
  const margin = ' '.repeat(12);
  // For each available report:
  reportSpecs.forEach(spec => {
    const {jobID, timeStamp, description} = spec;
    const specString = `${description} (job <code>${jobID}</code> at ${timeStamp})`;
    // Add a line with a radio button to hide it.
    lines.push(
      `${margin}<p><input type="radio" name="report" value="${timeStamp}-${jobID}"> ${specString}</p>`
    );
  });
  const query: Record<string, string> = {
    reports: lines.join('\n'),
  };
  // Get the populated hiding form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
