/*
  index.ts
  Reannotates all available latest reports.
*/

// IMPORTS

import {annotateReport, getReportExtracts} from '../../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Implements a reannotation order and returns an acknowledgement page.
export const answer = async (authCode: string) => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get data on the available reports.
    const reportExtracts = await getReportExtracts();
    // If any exist:
    if (reportExtracts.length) {
      // For each report:
      for (const reportExtract of reportExtracts) {
        const {timeStamp, jobID} = reportExtract;
        // Reannotate it.
        const annotationError = await annotateReport(timeStamp, jobID);
        // If this failed:
        if (annotationError) {
          // Return an error page.
          return {
            status: 'error',
            message: annotationError
          };
        }
      }
    }
    // Otherwis, i.e. if it failed:
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
