/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {getIssueData} = require('../issues/index');
const fs = require('fs/promises');

// FUNCTIONS

// Returns an array of the latest logs of tested targets.
const getTargetLogs = exports.getTargetLogs = async () => {
  // Initialize a directory of tested targets.
  const targetDirectory = {};
  const logNames = await fs.readdir('./logs');
  // For each log:
  for (const logName of logNames) {
    const logJSON = await fs.readFile(`./logs/${logName}`, 'utf8');
    const log = JSON.parse(logJSON);
    // Add its data to the targets directory, replacing any entry for the same target URL.
    targetDirectory[log.pageURL] = log;
  }
  // Get an array of those target logs, sorted by description.
  const targets = Object
  .values(targetDirectory)
  .sort((a, b) => a.pageWhat.localeCompare(b.pageWhat, 'en', {sensitivity: 'accent'}));
  return targets;
};
// Returns a date string from a time stamp.
const getDateString = timeStamp =>
  `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  // Initialize an array of list-item lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each target:
  targetLogs.forEach(async targetLog => {
    const {pageURL, pageWhat, timeStamp} = targetLog;
    const issueData = await getIssueData([targetLog]);
    // Add lines to the array.
    lines.push(`${margin}<li>${pageWhat}</li>`);
    lines.push(`${margin}  <ul>`);
    lines.push(`${margin}    <li>URL: <code>${pageURL}</code></li>`);
    lines.push(`${margin}    <li>Last tested: ${getDateString(timeStamp)}</li>`);
    lines.push(`${margin}    <li>Issues reported: ${Object.keys(issueData).length}</li>`);
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`)
  });
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
