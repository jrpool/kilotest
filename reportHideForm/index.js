/*
  index.js
  Serves a form for deleting sole reports.
*/

// IMPORTS

const {getJSON, getLog, logsPath, reportsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for deleting sole reports.
exports.answer = async (_, search) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobName = searchParams?.get('report');
  // If the form has been displayed by itself after a submission and a report is to be hidden:
  if (jobName) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
      // Get the log of the report.
      const log = await getLog(... jobName.split('-'));
      // Add a hiddenness property to the log.
      log.hidden = true;
      // Save the updated log.
      await fs.writeFile(path.join(logsPath, `${jobName}.json`), getJSON(log));
    }
    // Otherwise, i.e. if the authorization code is invalid:
    else {
      // Report the error.
      return {
        status: 'error',
        error: 'Invalid authorization code'
      }
    }
  }
  const reportFileNames = await fs.readdir(reportsPath);
  const reportSpecs = [];
  // For each report:
  for (const reportFileName of reportFileNames) {
    const [timeStamp, jobID] = reportFileName.slice(0, -5).split('-');
    // Get its log.
    const log = await getLog(timeStamp, jobID);
    const {what, hidden} = log;
    reportSpecs.push({
      what,
      timeStamp,
      jobID,
      hidden
    });
  }
  // Sort the logs by page name and then by time stamp.
  reportSpecs.sort((a, b) => {
    if (a.what === b.what) {
      return a.timeStamp.localeCompare(b.timeStamp);
    }
    return a.what.localeCompare(b.what);
  });
  const lines = [];
  const margin = ' '.repeat(12);
  // For each report:
  reportSpecs.forEach(spec => {
    const {hidden, what, timeStamp, jobID} = spec;
    // If it is not already hidden:
    if (! hidden) {
      const specString = `${what} (job <code>${jobID}</code> at ${timeStamp})`;
      // Add a line with a radio button to hide it.
      lines.push(
        `${margin}<p><input type="radio" name="report" value="${timeStamp}-${jobID}"> ${specString}</p>`
      );
    }
  });
  const query = {
    reports: lines.join('\n'),
  };
  // Get the order form template.
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
