/*
  index.ts
  Serves a form for requesting a retest.
*/

// IMPORTS

import {getReportExtracts, populateTemplate} from '../../util.ts';
import {getAgoString, getDateTimeString} from '../util.ts';

// FUNCTIONS

// Returns a retest recommendation form.
export const answer = async (pageArgs: string) => {
  const [timeStamp, jobID] = pageArgs.split('/') as [string, string];
  // Get data on the latest available reports.
  const reportExtracts = await getReportExtracts(true);
  // Get data on the report whose page is to be retested.
  const reportExtract = reportExtracts.find(
    (reportExtract: any) => reportExtract.timeStamp === timeStamp && reportExtract.jobID === jobID
  );
  // Initialize the page description.
  let target: string;
  // If getting the data succeeded:
  if (reportExtract) {
    // Update the page description.
    target = reportExtract.description;
  }
  // Otherwise, i.e. if it failed:
  else {
    // Make the form report the failure.
    target = 'The specified page is not available for retesting';
  }
  // Get the completion time of the report, or an invalid time if the report is unavailable.
  const reportTime = new Date(reportExtract?.reportTime ?? NaN);
  const query: Record<string, string> = {
    target,
    timeStamp,
    jobID,
    ago: getAgoString(reportTime),
    dateTime: getDateTimeString(reportTime)
  };
  // Get the recommendation form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
