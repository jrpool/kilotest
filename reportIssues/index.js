/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getDateTimeString,
  getLog,
  getReport,
  getReporterString,
  getWeightName,
  objectSort
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Gets summary data on the issues reported in a report.
const getIssuesSummary = async (timeStamp, jobID) => {
  // Initialize data for the summary.
  const log = await getLog(timeStamp, jobID, true);
  const {url, what} = log;
  const issuesData = {
    timeStamp,
    jobID,
    what,
    url,
    issues: {}
  };
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // For each act in it:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each of its standard instances:
      instances.forEach(instance => {
        const {issueID} = instance;
        // If the instance has a non-ignorable issue ID:
        if (issueID && issueID !== 'ignorable') {
          issuesData.issues[issueID] ??= new Set();
          // Ensure that the tool is in the issue data.
          issuesData.issues[issueID].add(which);
        }
      });
    }
  });
  // Initialize the summary.
  const summary = {
    timeStamp: issuesData.timeStamp,
    jobID: issuesData.jobID,
    what: issuesData.what,
    url: issuesData.url,
    reporters: new Set(),
    issues: []
  };
  // For each issue:
  Object.entries(issuesData.issues).forEach(([issueID, reporters]) => {
    // Ensure that the report reporters include the issue reporters.
    reporters.forEach(reporter => {
      summary.reporters.add(reporter);
    });
    // Add the issue data to the summary.
    summary.issues.push({
      issueID,
      weight: issues[issueID].weight,
      reporterCount: reporters.size,
      reporters: getReporterString(reporters)
    });
  });
  // Sort the issues in alphabetical order by reporter string.
  objectSort(summary.issues, 'reporters', 'alpha');
  // Sort the issues again in descending reporter-count order, making this the primary order.
  objectSort(summary.issues, 'reporterCount', 'numericDown');
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get a summary of data on the target.
  const summary = await getIssuesSummary(timeStamp, jobID);
  const {reporters, what} = summary;
  const issueCount = summary.issues.length;
  // Add an issue count description to the query.
  query.issueCount = issueCount === 1 ? '1 issue was' : `${issueCount} issues were`;
  const reporterCount = reporters.size;
  const reporterCountString = reporterCount === 1 ? '1 reporter' : `${reporterCount} reporters`;
  // Add a reporter count and list to the query.
  query.reporters = `${reporterCountString} (${getReporterString(reporters)})`;
  query.target = what;
  query.url = summary.url;
  query.jobID = jobID;
  query.dateTime = getDateTimeString(timeStamp);
  const margin = ' '.repeat(6);
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Initialize data on issues having the weight.
    const weightData = [];
    // For each summarized issue:
    summary.issues.forEach(issueSummary => {
      const {issueID, reporterCount, reporters} = issueSummary;
      // If it has the weight:
      if (issueSummary.weight === weight) {
        const issue = issues[issueID];
        const {wcag, why} = issue;
        // Add data on it to the weight data.
        weightData.push({
          issueID,
          summary: issue.summary,
          why,
          wcag,
          reporterCount,
          reporters
        });
      }
    });
    const weightName = getWeightName(weight);
    // Add the issue count to the query.
    query[`${weightName}Count`] = weightData.length;
    // If any reported issues have the weight:
    if (weightData.length) {
      // Initialize the lines for the weight.
      const weightLines = [];
      // For each issue that has the weight:
      weightData.forEach(weightIssue => {
        const {issueID, reporterCount, reporters, wcag, why} = weightIssue;
        // Add a heading to the lines.
        weightLines.push(`${margin}  <h5>${weightIssue.summary}</h5>`);
        // Add the start of a fact list to the lines.
        weightLines.push(`${margin}    <ul>`);
        // Add the issue facts to the lines.
        weightLines.push(`${margin}      <li>Why it matters: ${why}`);
        weightLines.push(`${margin}      <li>Related WCAG standard: ${wcag}`);
        const reporterCountString = reporterCount === 1 ? '1 tool' : `${reporterCount} tools`;
        weightLines.push(
          `${margin}      <li>Reported by ${reporterCountString} (${reporters})</li>`
        );
        const whereQuestionString = 'Where was the issue found?';
        const labelString = `Where was the ${weightIssue.summary} issue found on the ${what} page?`;
        const href = `href="/reportIssue.html/${issueID}/${timeStamp}/${jobID}"`;
        const label = `aria-label="${labelString}"`;
        const whereLink = `<a ${href} ${label}>${whereQuestionString}</a>`;
        weightLines.push(`${margin}      <li>${whereLink}</li>`);
        weightLines.push(`${margin}    </ul>`);
      });
      query[`${weightName}Details`] = weightLines.join('\n');
    }
    // Otherwise, i.e. if no reported issues have the weight:
    else {
      query[`${weightName}Details`] = `${margin}  <p>None</p>`;
    }
  });
};
// Returns a page answering the target-issues question.
exports.answer = async pageArgs => {
  const [timeStamp, jobID] = pageArgs.split('/');
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(timeStamp, jobID, query);
  // If the date and time are valid:
  if (query.dateTime) {
    // Get the template.
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
  }
  // Otherwise, report this.
  return {
    status: 'bad',
    error: 'Error: Invalid report specification.'
  };
};
