/*
  index.js
  Serves a form for deleting non-latest reports.
*/

// IMPORTS

const {getTargetSummary, reportsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for deleting non-latest reports.
exports.answer = async () => {
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
  // For each summary:
  reportSpecs.forEach((spec, index) => {
    const {timeStamp, jobID, issueCount, preventionCount, url} = spec;
    // If its report is a non-latest report:
    if (reportSpecs[index + 1]?.url === url) {
      // Add a line with a deletion checkbox.
      lines.push(`${margin}<p><input type="checkbox" name="report" value="${timeStamp}-${jobID}"> <code>${url}</code>: preventions ${preventionCount}, issues ${issueCount}</p>`);
    }
    // Otherwise, i.e. if its report is a latest report:
    else {
      // Add a line without a deletion checkbox.
      lines.push(`${margin}<p><code>${url}</code>: preventions ${preventionCount}, issues ${issueCount}</p>`);
    }
  });
  const query = {
    reports: lines.join('\n')
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
