/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {alphaSort, getIssueData, getTargetLogs, objectSort} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const toolNames = require('testaro/procs/job').tools;
const fs = require('fs/promises');

// FUNCTIONS

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
    const weightIssues = objectSort(weightIssueIDs.map(issueID => {
      const issueData = reportedIssueData[issueID];
      return {
        issueID,
        count: issueData.count,
        reporters: alphaSort(Array.from(issueData.reporters).map(toolID => toolNames[toolID]))
      };
    }), 'count', 'numericDown')
    .sort((a, b) => b.reporters.length - a.reporters.length);
    const lines = [];
    const margin = ' '.repeat(6);
    // Get an array of HTML list items describing the issues.
    weightIssues.forEach(issue => {
      const {count, issueID, reporters} = issue;
      const {summary, wcag, why} = issues[issueID];
      lines.push(`${margin}<li>${summary}</li>`);
      lines.push(`${margin}  <ul>`);
      lines.push(`${margin}    <li>Why it matters: ${why}</li>`);
      lines.push(`${margin}    <li>Related WCAG standard: ${wcag}</li>`);
      lines.push(`${margin}    <li>Violation count: ${count}</li>`);
      lines.push(`${margin}    <li>Reported by: ${reporters.join(' + ')}</li>`);
      lines.push(`${margin}  </ul>`);
      lines.push(`${margin}</li>`);
    });
    query[weightName] = lines.join('\n');
  });
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
