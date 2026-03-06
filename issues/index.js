/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {annotateReport} = require('../classify');
const {getTargetLogs} = require('../targets/index');
const {issues} = require('testilo/procs/score/tic');
const toolNames = require('testaro/procs/job').tools;
const fs = require('fs/promises');

// FUNCTIONS

// Gets data on the issues reported in a set of reports.
const getIssueData = async logs => {
  // Initialize the issue data.
  const issueData = {};
  // For each log:
  for (const log of logs) {
    const {annotated, timeStamp, jobID} = log;
    // If it is not yet annotated:
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
          const {count, issueID} = instance;
          // Increment the issue data with its count and reporter.
          issueData[issueID] ??= {
            count: 0,
            reporters: new Set()
          };
          issueData[issueID].count += count ?? 1;
          issueData[issueID].reporters.add(which);
        });
      }
    });
  }
  // Return the issue data.
  return issueData;
};
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  // Get the logs of the reports to be inspected.
  const logs = await getTargetLogs();
  // Get the issue data from their corresponding reports.
  const reportedIssueData = await getIssueData(logs);
  // For each issue weight:
  ['Lowest', 'Low', 'High', 'Highest'].forEach((weightName, index) => {
    const weightIssueIDs = Object
    .keys(reportedIssueData)
    .filter(issueID => issues[issueID]?.weight === index + 1);
    // Get data on the reported issues with the weight, sorted by reporter and violation counts.
    const weightIssues = weightIssueIDs
    .map(issueID => {
      const issueData = reportedIssueData[issueID];
      return {
        issueID,
        count: issueData.count,
        reporters: Array
        .from(issueData.reporters)
        .map(toolID => toolNames[toolID])
        .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'accent'}))
      };
    })
    .sort((a, b) => b.count - a.count)
    .sort((a, b) => b.reporters.length - a.reporters.length);
    const lines = [];
    const margin = ' '.repeat(6);
    // Get an array of HTML list items describing the issues.
    weightIssues.forEach(issue => {
      const {count, issueID, reporters} = issue;
      const issueProps = issues[issueID];
      lines.push(`${margin}<li>${issueProps.summary}</li>`);
      lines.push(`${margin}  <ul>`);
      lines.push(`${margin}    <li>Why it matters: ${issueProps.why}</li>`);
      linesines.push(`${margin}    <li>Related WCAG standard: ${issueProps.wcag}</li>`);
      linesines.push(`${margin}    <li>Violation count: ${issue.count}</li>`);
      linesines.push(`${margin}    <li>Reported by: ${issue.reporters}</li>`);
      lines.push(`${margin}  </ul>`);
      lines.push(`${margin}</li>`)
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
