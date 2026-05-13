/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getPageDataStrings,
  getReport,
  getToolNamesString,
  getWCAGLink,
  getWeightName,
  objectSort
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Gets data on the issues reported in a report.
const getIssuesData = async (timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const preventedTools = new Set(Object.keys(report?.jobData?.preventions ?? {}));
  const issuesData = {
    reporters: new Set(),
    reporterCount: 0,
    reportersString: '',
    violators: new Set(),
    violatorCount: 0,
    preventedTools,
    preventedToolCount: 0,
    preventedToolsString: '',
    issuesObject: {},
    issueCount: 0,
    issues: []
  };
  const {issuesObject, reporters, violators} = issuesData;
  // For each act in it:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each of its standard instances:
      instances.forEach(instance => {
        const {issueID} = instance;
        // If the instance has a non-ignorable classified issue:
        if (issueID && issues[issueID] && issueID !== 'ignorable') {
          // Ensure that the issues data include data on the issue.
          issuesObject[issueID] ??= {
            issueID,
            weight: issues[issueID].weight ?? 0,
            reporters: new Set(),
            reporterCount: 0,
            reportersString: '',
            violators: new Set(),
            violatorCount: 0
          };
          // Ensure that the tool is in the issues data.
          reporters.add(which);
          // Ensure that it is in the issue data.
          issuesObject[issueID].reporters.add(which);
          const {catalogIndex} = instance;
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure that the violator is in the issues data.
            violators.add(catalogIndex);
            // Ensure that it is in the issue data.
            issuesObject[issueID].violators.add(catalogIndex);
          }
        }
      });
    }
  });
  // Populate the unpopulated subproperties of the issues data.
  issuesData.reporterCount = issuesData.reporters.size;
  issuesData.reportersString = getToolNamesString(issuesData.reporters);
  issuesData.violatorCount = issuesData.violators.size;
  issuesData.preventedToolCount = issuesData.preventedTools.size;
  issuesData.preventedToolsString = getToolNamesString(issuesData.preventedTools);
  issuesData.issueCount = Object.keys(issuesData.issuesObject).length;
  issuesData.issues = Object.values(issuesData.issuesObject);
  // For each issue in the issues data:
  issuesData.issues.forEach(issue => {
    // Populate its unpopulated properties.
    issue.reporterCount = issue.reporters.size;
    issue.reportersString = getToolNamesString(issue.reporters);
    issue.violatorCount = issue.violators.size;
  });
  // Sort the issues alphabetically by reporters string.
  objectSort(issuesData.issues, 'reportersString', 'alpha');
  // Sort the issues again in descending reporter-count order, making this the primary order.
  objectSort(issuesData.issues, 'reporterCount', 'numericDown');
  // Return the issues data.
  return issuesData;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get fact descriptions.
  const pageDataStrings = await getPageDataStrings(timeStamp, jobID);
  const {what, urlLink, testInfo} = pageDataStrings;
  const issuesData = await getIssuesData(timeStamp, jobID);
  const {
    issueCount, preventedToolCount, preventedToolsString, reporterCount, reportersString
  } = issuesData;
  const preventedToolCountString = preventedToolCount === 1
  ? '1 tool'
  : `${preventedToolCount} tools`;
  // Add a list of prevented tools, if any, to the query.
  query.preventedTools = preventedToolCount
  ? `<li>Page prevented testing by ${preventedToolCountString} (${preventedToolsString})</li>`
  : '';
  // Add an issue count description to the query.
  query.issueCount = issueCount === 1 ? '1 issue was' : `${issueCount} issues were`;
  query.reporterCount = reporterCount === 1 ? '1 tool' : `${reporterCount} tools`;
  // Add a reporter count and list to the query.
  query.reporters = reportersString;
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  const margin = ' '.repeat(6);
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Initialize data on issues having the weight.
    const weightData = [];
    // Initialize the lines for the weight.
    const weightLines = [];
    // For each issue:
    issuesData.issues.forEach(issueData => {
      const {
        issueID, reporterCount, reportersString, violatorCount, weight: issueWeight
      } = issueData;
      // If it has the weight:
      if (issueWeight === weight) {
        const issue = issues[issueID];
        const {wcag, why} = issue;
        const wcagLink = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
        // Add data on it to the weight data.
        weightData.push({
          issueID,
          summary: issue.summary,
          why,
          wcag: wcagLink,
          reporterCount,
          reportersString,
          violatorCount
        });
      }
    });
    const weightName = getWeightName(weight);
    // Add the issue count to the query.
    query[`${weightName}Count`] = weightData.length;
    // If any reported issues have the weight:
    if (weightData.length) {
      // Add the start of a list of the issues with the weight to the lines.
      weightLines.push(`${margin}<ul class="headed">`);
      // For each issue with the weight:
      weightData.forEach(weightIssue => {
        const {issueID, reporterCount, reporters, violatorCount, wcag, why} = weightIssue;
        // Add the start of a list item to the lines.
        weightLines.push(`${margin}  <li>`);
        // Add a heading summarizing the issue to the lines.
        weightLines.push(`${margin}    <h5>${weightIssue.summary}</h5>`);
        // Add the start of alist of facts about the issue to the lines.
        weightLines.push(`${margin}    <ul class="pseudoTopLevel">`);
        // Add the issue facts to the lines.
        weightLines.push(`${margin}      <li>Why it matters: ${why}`);
        weightLines.push(`${margin}      <li>Related WCAG standard: ${wcag}`);
        const reporterCountString = reporterCount === 1 ? '1 tool' : `${reporterCount} tools`;
        weightLines.push(
          `${margin}      <li>Reported by ${reporterCountString} (${reporters})</li>`
        );
        const violatorCountString = violatorCount === 1
        ? '1 violator'
        : `${violatorCount} violators`;
        weightLines.push(`${margin}      <li>${violatorCountString} reported</li>`);
        // Add the end of the fact list to the lines.
        weightLines.push(`${margin}    </ul>`);
        // Add the start of a link list to the lines.
        weightLines.push(`${margin}    <ul class="nav">`);
        const whereQuestionString = 'Where was the issue found?';
        const labelString = `Where was the ${weightIssue.summary} issue found on the ${what} page?`;
        const href = `href="/reportIssue.html/${issueID}/${timeStamp}/${jobID}"`;
        const label = `aria-label="${labelString}"`;
        const whereLink = `<a ${href} ${label}>${whereQuestionString}</a>`;
        // Add a violations link to the lines.
        weightLines.push(`${margin}      <li>${whereLink}</li>`);
        // Add the end of the link list to the lines.
        weightLines.push(`${margin}    </ul>`);
        // Add the end of the list item to the lines.
        weightLines.push(`${margin}  </li>`);
      });
      // Add the end of the list of issues with the weight to the lines.
      weightLines.push(`${margin}</ul>`);
      // Add the lines documenting the issues with the weight to the query.
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
  if (query.testInfo) {
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
