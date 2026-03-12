/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  annotateReport,
  getDateTimeString,
  getLogPath,
  getReporterString,
  getReportPath,
  getWeightName,
  objectSort
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// FUNCTIONS

// Gets summary data on the issues reported in a report.
const getIssuesSummary = async (timeStamp, jobID) => {
  // Initialize data for the summary.
  const logJSON = await fs.readFile(getLogPath(timeStamp, jobID), 'utf8');
  const log = JSON.parse(logJSON);
  const {annotated, pageURL, pageWhat} = log;
  const issuesData = {
    timeStamp,
    jobID,
    pageWhat,
    pageURL,
    issues: {}
  };
  // If the report is not yet annotated:
  if (! annotated) {
    // Annotate it and mark it as annotated in the log.
    await annotateReport(timeStamp, jobID);
  }
  // Get the report.
  const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
  const report = JSON.parse(reportJSON);
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
          issuesData.issues[issueID] ??= {
            count: 0,
            reporters: new Set()
          };
          // Add the instance data on violations to the data on its issue.
          issuesData.issues[issueID].count += count ?? 1;
          issuesData.issues[issueID].reporters.add(which);
        }
      });
    }
  });
  // Initialize the summary.
  const summary = {
    timeStamp: issuesData.timeStamp,
    jobID: issuesData.jobID,
    pageWhat: issuesData.pageWhat,
    pageURL: issuesData.pageURL,
    count: 0,
    reporters: new Set(),
    issues: []
  };
  // For each issue:
  Object.entries(issuesData.issues).forEach(([issueID, data]) => {
    const {count, reporters} = data;
    // Increment the report violation count by the issue violation count.
    summary.count += count;
    // Ensure that the report reporters include the issue reporters.
    reporters.forEach(reporter => {
      summary.reporters.add(reporter);
    });
    // Add the issue data to the summary.
    summary.issues.push({
      issueID,
      weight: issues[issueID].weight,
      count,
      reporters: getReporterString(reporters)
    });
  });
  // Sort the issues in descending count order.
  objectSort(summary.issues, 'count', 'numericDown');
  // Sort them again in descending priority order, making this the primary order.
  objectSort(summary.issues, 'weight', 'numericDown');
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get a summary of data on the target.
  const summary = await getIssuesSummary(timeStamp, jobID);
  const {pageURL, pageWhat} = summary;
  query.target = pageWhat;
  query.url = pageURL;
  query.dateTime = getDateTimeString(timeStamp);
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Add a heading to the lines.
    lines.push(`${margin}<h3>${getWeightName(weight)} priority</h3>`);
    lines.push(`${margin}<ul>`);
    // For each summarized issue:
    summary.issues.forEach(issueSummary => {
      const {issueID, count, reporters} = issueSummary;
      // If it has the weight:
      if (issueSummary.weight === weight) {
        const issue = issues[issueID];
        const {wcag, why} = issue;
        // Add a description of it to the lines.
        lines.push(`${margin}  <li>${issue.summary}`);
        lines.push(`${margin}    <ul>`);
        lines.push(`${margin}      <li>Why it matters: ${why}`);
        lines.push(`${margin}      <li>Related WCAG standard: ${wcag}`);
        lines.push(`${margin}      <li>Violation count: ${count}</li>`);
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
// Returns a page answering the target-issues question.
exports.answer = async reportSpec => {
  const [timeStamp, jobID] = reportSpec.split('-');
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(timeStamp, jobID, query);
  // If the date and time are valid:
  if (query.dateTime) {
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
  }
  // Otherwise, report this.
  return {
    status: 'bad',
    error: 'Error: Invalid report specification.'
  };
};
