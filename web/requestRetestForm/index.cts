/*
  index.cts
  Serves a form for requesting a retest.
*/

// IMPORTS

const {getAgoString, getDateTimeString, getReportExtracts} = require('../../util.ts');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a retest recommendation form.
exports.answer = async (pageArgs: string) => {
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
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
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
