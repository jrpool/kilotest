/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {getData} = require('./util');
const {
  getPageDataStrings,
  getReport,
  getToolNamesString,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isHidden,
  isValidReport,
  objectSort,
  tools
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Gets data on the issues reported in a report.
const getIssuesData = async (timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If it is valid:
  if (typeof report === 'object' && isValidReport(report)) {
    const issuesData = {
      reporters: new Set(),
      reporterCount: 0,
      reportersString: '',
      violators: new Set(),
      violatorCount: 0,
      preventions: {},
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
    issuesData.preventions = report.jobData.preventions;
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
  }
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get data on the page and its issues according to the report.
  const data = await getData(timeStamp, jobID);
  // If the page data are invalid:
  if (typeof data.page === 'string') {
    // Return this.
    return data.page;
  }
  // Otherwise, if the issues data are invalid:
  if (typeof data.issues === 'string') {
    // Return this.
    return data.issues;
  }
  // Otherwise, get fact descriptions for the page.
  const pageInfo = await getPageDataStrings(timeStamp, jobID, data.page);
  const {what, urlLink, testInfo} = pageInfo;
  // Add page data to the query.
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  const {
    reporters,
    reporterList,
    reporterCount,
    violatorCount,
    issueCount,
    preventions,
    issues
  } = data.issues;
  const preventionStrings = [];
  const margin = ' '.repeat(6);
  Object.keys(preventions).forEach(preventedToolID => {
    const toolName = tools[preventedToolID];
    const toolNameString = `${toolName[0]} (${toolName[1]})`;
    const causeString = htmlSafe(preventions[preventedToolID]);
    const preventionString = `${margin}<li>Page not testable by ${toolNameString}: ${causeString}</li>`;
    preventionStrings.push(preventionString);
  });
  // Add prevention notices to the query.
  query.preventions = preventionStrings.join('\n');
  // Add report data to the query.
  query.timeStamp = timeStamp;
  query.jobID = jobID;
  // Add reporter information to the query.
  query.reporterCount = reporterCount === 1 ? '1 tool' : `${reporterCount} tools`;
  query.reporters = reporterList;
  // Add a summary of the issues to the query.
  query.issueCount = issueCount === 1 ? '1 issue was' : `${issueCount} issues were`;
  query.highestCount = data.issues[4].length;
  query.highCount = data.issues[3].length;
  query.lowCount = data.issues[2].length;
  query.lowestCount = data.issues[1].length;
  // Add a violator count to the query.
  query.violatorCount = violatorCount === 1 ? '1 violator was' : `${violatorCount} violators were`;
  const detailsNames = {
    4: 'highest',
    3: 'high',
    2: 'low',
    1: 'lowest'
  };
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Initialize data on issues having the weight.
    const weightData = [];
    // Initialize the lines for the weight.
    const weightLines = [];
    // For each issue:
    data.issues[weight].forEach(issueData => {
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
        const {issueID, reporterCount, reportersString, violatorCount, wcag, why} = weightIssue;
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
          `${margin}      <li>Reported by ${reporterCountString} (${reportersString})</li>`
        );
        const violatorCountString = violatorCount === 1
        ? '1 violator was'
        : `${violatorCount} violators were`;
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
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(timeStamp, jobID, query);
  // If the report facts were obtained:
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
  // Otherwise, i.e. if they were not obtained, report this.
  return {
    status: 'error',
    error: 'Report processing failed'
  };
};
