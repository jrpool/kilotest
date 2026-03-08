/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {getReporterString, getReportPath, getTally, getTargetLogs, getTargetSummary} = require('../util');
const fs = require('fs/promises');

// FUNCTIONS

// Returns a date string from a time stamp.
const getDateString = timeStamp =>
  `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
// Returns a time string from a time stamp.
const getTimeString = timeStamp => `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  // Initialize an array of list-item lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For the latest log on each target:
  for (const targetLog of targetLogs) {
    const {jobID, pageURL, pageWhat, timeStamp} = targetLog;
    const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
    const report = JSON.parse(reportJSON);
    const summary = getTargetSummary(timeStamp, jobID);
    const {issueSet, reporterSet} = tally;
    // Add lines to the array.
    lines.push(`${margin}<li>${pageWhat}</li>`);
    lines.push(`${margin}  <ul>`);
    lines.push(`${margin}    <li>URL: <code>${pageURL}</code></li>`);
    lines.push(
      `${margin}    <li>Last tested on ${getDateString(timeStamp)} at ${getTimeString(timeStamp)} (job <code>${jobID}</code>)</li>`
    );
    lines.push(`${margin}    <li>Issues reported: ${issueSet.size}</li>`);
    lines.push(
      `${margin}    <li>Tools reporting issues: ${reporterSet.size} (${getReporterString(reporterSet)})</li>`
    );
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`)
  }
  query.testedPages = lines.join('\n');
};
// Returns a page answering the targets question.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // Get the template.
  let template = await fs.readFile(`${__dirname}/index.html`, 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    template = template.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return template;
};
