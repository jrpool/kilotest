/*
  index.js
  Serves a form for hiding a report.
*/

// IMPORTS

const {getReportExtracts, hiddenReportsPath, makeReportsExtract, reportsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for hiding a report.
exports.answer = async (_, search) => {
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
        await fs.rename(path.join(reportsPath, fileName), path.join(hiddenReportsPath, fileName));
        // Update the data on the available reports.
        await makeReportsExtract();
      }
      // If this failed:
      catch (error) {
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
  const reportSpecs = [];
  // Get data on all available reports.
  const reportExtracts = await getReportExtracts();
  // For each report:
  for (const reportExtract of reportExtracts) {
    const {jobID, timeStamp, what} = reportExtract;
    // Add the report to the array.
    reportSpecs.push({
      what,
      timeStamp,
      jobID
    });
  }
  // Sort the data by page name and then by time stamp.
  reportSpecs.sort((a, b) => {
    if (a.what === b.what) {
      return a.timeStamp.localeCompare(b.timeStamp);
    }
    return a.what.localeCompare(b.what);
  });
  const lines = [];
  const margin = ' '.repeat(12);
  // For each available report:
  reportSpecs.forEach(spec => {
    const {jobID, timeStamp, what} = spec;
    const specString = `${what} (job <code>${jobID}</code> at ${timeStamp})`;
    // Add a line with a radio button to hide it.
    lines.push(
      `${margin}<p><input type="radio" name="report" value="${timeStamp}-${jobID}"> ${specString}</p>`
    );
  });
  const query = {
    reports: lines.join('\n'),
  };
  // Get the hiding form template.
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
