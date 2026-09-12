/*
  index.ts
  Serves a form for unhiding a report.
*/

// IMPORTS

import {hiddenReportsPath, reportsPath} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Returns a form for unhiding a report.
export const answer = async (_: any, search: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobName = searchParams?.get('report');
  // If the form has been displayed by itself after a submission and a report is to be unhidden:
  if (jobName) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
      const fileName = `${jobName}.json`;
      try {
        // Move the report to the reports directory.
        await fs.rename(path.join(hiddenReportsPath(), fileName), path.join(reportsPath(), fileName));
      }
      catch (error: any) {
        // Return why.
        return {
          status: 'error',
          message: `Unhiding report file ${fileName} failed (${error.message})`
        }
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
  // Initialize an array of data on reports to be unhidden.
  const reportsData: any[] = [];
  // Get the names of the hidden report files.
  const hiddenReportFileNames = await fs.readdir(hiddenReportsPath());
  // For each hidden report:
  for (const reportFileName of hiddenReportFileNames) {
    // Get its file.
    const reportJSON = await fs.readFile(path.join(hiddenReportsPath(), reportFileName), 'utf8');
    // Get the report.
    const report = JSON.parse(reportJSON);
    const {id, target} = report;
    const [timeStamp, jobID] = id.split('-');
    const {what} = target;
    // Add its data to the array.
    reportsData.push({
      what,
      timeStamp,
      jobID
    });
  }
  // Sort the data by page name and then by time stamp.
  reportsData.sort((a, b) => {
    if (a.what === b.what) {
      return a.timeStamp.localeCompare(b.timeStamp);
    }
    return a.what.localeCompare(b.what, 'en', {sensitivity: 'base'});
  });
  const lines: string[] = [];
  const margin = ' '.repeat(12);
  // For each report:
  reportsData.forEach(data => {
    const {jobID, timeStamp, what} = data;
    const specString = `${what} (job <code>${jobID}</code> at ${timeStamp})`;
    // Add a line with a radio button to unhide it.
    lines.push(
      `${margin}<p><input type="radio" name="report" value="${timeStamp}-${jobID}"> ${specString}</p>`
    );
  });
  const query: Record<string, string> = {
    reports: lines.join('\n'),
  };
  // Get the unhiding form template.
  let answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
