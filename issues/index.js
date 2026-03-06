/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {annotateReport} = require('../classify');
const {getTargetLogs} = require('./targets');
const fs = require('fs/promises');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  // Initialize the issue data.
  const issueReporters = {};
  // Get the logs of the reports to be inspected.
  const logs = await getTargetLogs();
  // For each of those logs:
  for (const log of logs) {
    const {annotated, timeStamp, jobID} = log;
    // If the report has not yet been annotated:
    if (! annotated) {
      // Annotate it.
      await annotateReport(timeStamp, jobID);
    }
    // Get the corresponding report.
    const reportJSON = await fs.readFile(
      `${__dirname}/../reports/${timeStamp}-${jobID}.json`, 'utf8'
    );
    const report = JSON.parse(reportJSON);
    // For each act in it:
    report.acts.forEach(act => {
      // If it is a test act:
      if (act.type === 'test') {
        const {which} = act;
        const instances = act.result?.standardResult?.instances ?? [];
        // For each of its standard instances:
        instances.forEach(instance => {
          const {ruleID} = instance;
          // Ensure that the issue that the rule belongs to has the tool as a reporter.
          issueReporters[ruleID] ??= new Set();
          issueReporters[ruleID].add(which);
        });
      }
    });
  }
  // Get an array of target data sorted by description.
  const itemLines = [];
  const margin = ' '.repeat(6);
  // Get an array of HTML list items describing the targets.
  targets.forEach(target => {
    const {pageURL, pageWhat, timeStamp} = target;
    itemLines.push(`${margin}<li>${pageWhat}</li>`);
    itemLines.push(`${margin}  <ul>`);
    itemLines.push(`${margin}    <li>URL: ${pageURL}</li>`);
    itemLines.push(`${margin}    <li>Last tested: ${getDateString(timeStamp)}</li>`);
    itemLines.push(`${margin}  </ul>`);
    itemLines.push(`${margin}</li>`)
  });
  query.itemLines = itemLines;
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
