/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  annotateReport,
  getReport,
  getReporterString,
  getReportPath,
  getTargetLogs,
  getWeightName,
  objectSort
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// FUNCTIONS

// Gets summary data on the issues reported in a set of reports.
const getIssuesSummary = async logs => {
  // Initialize data for a summary.
  const issuesData = {};
  // For each log of a report to be inspected:
  for (const log of logs) {
    const {annotated, timeStamp, jobID} = log;
    // If the corresponding report is not yet annotated:
    if (! annotated) {
      // Annotate it and mark it as annotated in the log.
      await annotateReport(timeStamp, jobID);
    }
    // Get the corresponding report.
    const report = await getReport(timeStamp, jobID);
    // For each act in it:
    report.acts.forEach(act => {
      // If it is a test act:
      if (act.type === 'test') {
        const {result, which} = act;
        const instances = result?.standardResult?.instances ?? [];
        // For each of its standard instances:
        instances.forEach(instance => {
          const {count, issueID} = instance;
          // If the instance has a non-ignorable issue ID:
          if (issueID && issueID !== 'ignorable') {
            issuesData[issueID] ??= {
              count: 0,
              reporters: new Set()
            };
            // Increment the data with the count and reporter of the instance.
            issuesData[issueID].count += count ?? 1;
            issuesData[issueID].reporters.add(which);
          }
        });
      }
    });
  }
  // Initialize the summary.
  const summary = {
    totalCount: 0,
    issues: []
  };
  // For each issue:
  Object.entries(issuesData).forEach(([issueID, data]) => {
    const {count, reporters} = data;
    // Increment the report violation count by the issue violation count.
    summary.totalCount += count;
    // Add the issue data and an initilized percentage to the summary.
    summary.issues.push({
      issueID,
      weight: issues[issueID].weight,
      count,
      percentage: 0,
      reporters: getReporterString(reporters)
    });
  });
  // For each summarized issue:
  summary.issues.forEach(issue => {
    // Add its percentage to its entry.
    issue.percentage = Math.round(100 * (issue.count / summary.totalCount));
  });
  // Sort the issues in descending count order.
  objectSort(summary.issues, 'count', 'numericDown');
  // Sort the issues in descending priority order.
  objectSort(summary.issues, 'weight', 'numericDown');
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  // Get summary data on the issues.
  const issuesSummary = await getIssuesSummary(targetLogs);
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Add a heading to the lines.
    lines.push(`${margin}<h2>${getWeightName(weight)} priority</h2>`);
    lines.push(`${margin}<ul>`);
    // For each summarized issue:
    issuesSummary.issues.forEach(issueSummary => {
      const {issueID, percentage, reporters} = issueSummary;
      // If it has the weight and its percentage is at least 2:
      if (issueSummary.weight === weight && percentage >= 2) {
        const issue = issues[issueID];
        const {summary, wcag, why} = issue;
        // Add a description of it to the lines.
        lines.push(`${margin}  <li>${summary}`);
        lines.push(`${margin}    <ul>`);
        lines.push(`${margin}      <li>Why it matters: ${why}`);
        lines.push(`${margin}      <li>Related WCAG standard: ${wcag}`);
        lines.push(`${margin}      <li>Share of violations: ${percentage}%</li>`);
        lines.push(`${margin}      <li>Reported by ${reporters}</li>`);
        lines.push(`${margin}    </ul>`);
        lines.push(`${margin}  </li>`);
      }
    });
    lines.push(`${margin}</ul>`);
  });
  // Add the lines to the query.
  query.issues = lines.join('\n');
};
// Returns a page answering the targets question.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // Get the template.
  let answerPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
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
