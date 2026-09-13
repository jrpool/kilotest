/*
  index.ts
  Reannotates all available latest reports.
*/

// IMPORTS

import {
  annotateReportObject,
  getJSON,
  getReport,
  getReportPath,
  isReportError,
  reportsPath
} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Implements a reannotation order and returns an acknowledgement page.
export const answer = async (authCode: string) => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get the names of the stored report files.
    const reportFileNames = (await fs.readdir(reportsPath()))
    .filter(fileName => fileName.endsWith('.json'));
    // If any exist:
    if (reportFileNames.length) {
      // For each report file:
      for (const reportFileName of reportFileNames) {
        const [timeStamp, jobID] = reportFileName.slice(0, -5).split('-');
        // Get the report.
        const report = await getReport(timeStamp, jobID);
        // If this failed:
        if (isReportError(report)) {
          // Return an error page.
          return {
            status: 'error',
            message: report.error
          };
        }
        // Otherwise, i.e. if it succeeded, reannotate it in place.
        await annotateReportObject(report);
        // Save the reannotated report.
        await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
      }
    }
    // Otherwise, i.e. if it failed:
    else {
      // Return an error page.
      return {
        status: 'error',
        message: 'Got data on no available reports'
      };
    }
    // If every annotation succeeded, get the answer page.
    const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
    // Return it.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, i.e. if the authorization code is invalid, return an error page.
  return {
    status: 'error',
    message: 'Invalid authorization code'
  };
};
