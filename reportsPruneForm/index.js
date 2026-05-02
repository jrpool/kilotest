/*
  index.js
  Serves a form for deleting superseded reports.
*/

// IMPORTS

const {getTargetSummary, reportsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for deleting non-latest reports.
exports.answer = async (_, search) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  const jobNames = searchParams?.getAll('report');
  // If the form will redisplay itself after reports are deleted:
  if (jobNames?.length) {
    // If the authorization code is valid:
    if (authCode === process.env.AUTH_CODE) {
      // For each report to be deleted:
      for (const jobName of jobNames) {
        // Delete it.
        await fs.unlink(path.join(reportsPath, `${jobName}.json`));
      }
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
  const reportNames = await fs.readdir(reportsPath);
  const reportSpecs = [];
  // For each report:
  for (const reportName of reportNames) {
    const [timeStamp, jobID] = reportName.slice(0, -5).split('-');
    // Get a summary of it.
    const reportSummary = await getTargetSummary(timeStamp, jobID);
    const {issueSet, preventedTools, url} = reportSummary;
    reportSpecs.push({
      timeStamp,
      jobID,
      issueCount: issueSet.size,
      preventionCount: preventedTools?.length ?? 0,
      url
    });
  }
  // Sort the summaries by URL and then by time stamp.
  reportSpecs.sort((a, b) => {
    if (a.url === b.url) {
      return a.timeStamp.localeCompare(b.timeStamp);
    }
    return a.url.localeCompare(b.url);
  });
  const lines = [];
  const margin = ' '.repeat(12);
  let anyDeletable = false;
  // For each summary:
  reportSpecs.forEach((spec, index) => {
    const {timeStamp, jobID, issueCount, preventionCount, url} = spec;
    const jobName = `${timeStamp}-${jobID}`;
    const specString = `<code>${url}</code> (<code>${jobName}</code>): preventions ${preventionCount}, issues ${issueCount}`;
    // If its report is a non-latest report:
    if (reportSpecs[index + 1]?.url === url) {
      // Add a line with a deletion checkbox.
      lines.push(
        `${margin}<p><input type="checkbox" name="report" value="${jobName}"> ${specString}</p>`
      );
      anyDeletable = true;
    }
    // Otherwise, i.e. if its report is a latest report:
    else {
      // Add a line without a deletion checkbox.
      lines.push(`${margin}<p>${specString}</p>`);
    }
  });
  const intro = anyDeletable
  ? 'Choose the superseded reports to delete.'
  : 'Each target has only 1 report, so there are no superseded reports to delete.';
  const disabled = anyDeletable ? '' : ' disabled';
  const query = {
    reports: lines.join('\n'),
    intro,
    disabled
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
