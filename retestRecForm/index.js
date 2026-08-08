/*
  index.js
  Answers the retest question.
*/

// IMPORTS

const {getAgoString, getDateTimeString, getLatestReportsData} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a retest recommendation form.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  // Get data on the latest available reports.
  const reportsData = await getLatestReportsData();
  // Get data on the report whose page is to be retested.
  const reportData = reportsData.find(
    reportData => reportData.timeStamp === timeStamp && reportData.jobID === jobID
  );
  // Initialize the page description.
  let target;
  // If getting the data succeeded:
  if (reportData) {
    // Update the page description.
    target = reportData.what;
  }
  // Otherwise, i.e. if it failed:
  else {
    // Make the form report the failure.
    target = 'The specified page is not available for retesting';
  }
  const query = {
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
