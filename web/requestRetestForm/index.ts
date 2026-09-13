/*
  index.ts
  Serves a form for requesting a retest.
*/

// IMPORTS

import {getAgoString, getDateTimeString, getReportExtracts, populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns a retest recommendation form.
export const answer = async (pageArgs: string) => {
  const [timeStamp, jobID] = pageArgs.split('/');
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
    target = reportExtract.what;
  }
  // Otherwise, i.e. if it failed:
  else {
    // Make the form report the failure.
    target = 'The specified page is not available for retesting';
  }
  const query: Record<string, string> = {
    target,
    timeStamp,
    jobID,
    ago: getAgoString(timeStamp),
    dateTime: getDateTimeString(timeStamp)
  };
  // Get the recommendation form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
