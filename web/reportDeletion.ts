/*
  reportDeletion.ts
  Shared implementation of the forms for deleting reports.
*/

// IMPORTS

import {
  errorMessage, getReportData, objectSort, populateTemplate, readdirOrCreate, reportsPath
} from '../util.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// A summary of an available report, as shown in a deletion form.
type ReportSpec = {
  timeStamp: string;
  jobID: string;
  issueCount: number;
  preventedEngineCount: number;
  url: string;
};

// The distinctive properties of a report-deletion form.
export type DeletionSpec = {
  intro: string;
  emptyIntro: string;
  failurePrefix: string;
  isDeletable: (specs: ReportSpec[], index: number) => boolean;
};

// FUNCTIONS

// Returns a form for deleting the reports that the predicate marks as deletable. A GET
// request never processes a submission, regardless of its query string; only a POST
// request (the form's own submission) does.
export const reportDeletionForm = async (
  dirName: string,
  search: string,
  method: string,
  deletionSpec: DeletionSpec
): Promise<{status: string; message?: string; answerPage?: string}> => {
  const {emptyIntro, failurePrefix, intro, isDeletable} = deletionSpec;
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobNames = searchParams?.getAll('report');
  // If the form has been submitted and any reports are to be deleted:
  if (method === 'POST' && jobNames?.length) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
      try {
        // For each report to be deleted:
        for (const jobName of jobNames) {
          // Delete it.
          await fs.unlink(path.join(reportsPath(), `${jobName}.json`));
        }
      }
      // If this failed:
      catch (error: unknown) {
        // Return why.
        return {
          status: 'error',
          message: `${failurePrefix} (${errorMessage(error)})`
        };
      }
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error, deliberately vague so as not to confirm to an attacker that the
      // authorization code specifically (as opposed to some other part of the request) is
      // what was wrong.
      return {
        status: 'error',
        message: 'Invalid request'
      };
    }
  }
  const reportNames = await readdirOrCreate(reportsPath(), 'Reports directory');
  // Initialize an array of report summaries.
  const reportSpecs: ReportSpec[] = [];
  // For each report:
  for (const reportName of reportNames) {
    const [timeStamp, jobID] = reportName.slice(0, -5).split('-') as [string, string];
    // Get a summary of it.
    const reportFacts = await getReportData(timeStamp, jobID);
    // If this failed:
    if (reportFacts.error !== undefined) {
      // Return why.
      return {
        status: 'error',
        message: reportFacts.error
      };
    }
    const {issueCount, preventedEngineCount, url} = reportFacts;
    // Otherwise, i.e. if it succeeded, add the summary to the array.
    reportSpecs.push({
      timeStamp,
      jobID,
      issueCount,
      preventedEngineCount,
      url
    });
  }
  // Sort the summaries primarily by URL and secondarily by time stamp.
  objectSort(reportSpecs, 'timeStamp', 'alpha');
  objectSort(reportSpecs, 'url', 'alpha');
  const lines: string[] = [];
  const margin = ' '.repeat(12);
  let anyDeletable = false;
  // For each summary:
  reportSpecs.forEach((reportSpec, index) => {
    const {timeStamp, jobID, issueCount, preventedEngineCount, url} = reportSpec;
    const jobName = `${timeStamp}-${jobID}`;
    const specString = `<code>${url}</code> (<code>${jobName}</code>): preventions ${preventedEngineCount}, issues ${issueCount}`;
    // If its report is deletable:
    if (isDeletable(reportSpecs, index)) {
      // Add a line with a deletion checkbox.
      lines.push(
        `${margin}<p><input type="checkbox" name="report" value="${jobName}"> ${specString}</p>`
      );
      anyDeletable = true;
    }
    // Otherwise, i.e. if its report is not deletable:
    else {
      // Add a line without a deletion checkbox.
      lines.push(`${margin}<p>${specString}</p>`);
    }
  });
  const query: Record<string, string> = {
    reports: lines.join('\n'),
    intro: anyDeletable ? intro : emptyIntro,
    disabled: anyDeletable ? '' : ' disabled'
  };
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(dirName, query)
  };
};
