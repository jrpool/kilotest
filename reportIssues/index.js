/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {getData} = require('./util');
const {
  getPageDataStrings,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isHidden,
  tools
} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get data on the target and its issues according to the report.
  const data = await getData(timeStamp, jobID);
  const {pageData, issuesData} = data;
  // If the page data are invalid:
  if (typeof pageData === 'string') {
    // Return this.
    return pageData;
  }
  // Otherwise, if the issues data are invalid:
  if (typeof issuesData === 'string') {
    // Return this.
    return issuesData;
  }
  // Otherwise, get fact descriptions for the target.
  const pageInfo = await getPageDataStrings(timeStamp, jobID, pageData);
  const {what, urlLink, testInfo} = pageInfo;
  // Add target data to the query.
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  const {
    reporterList,
    reporterCount,
    violatorCount,
    issueCount,
    preventions,
    issues
  } = issuesData;
  // Initialize strings for the prevention notices query property.
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
  query.highestCount = issues[4].length;
  query.highCount = issues[3].length;
  query.lowCount = issues[2].length;
  query.lowestCount = issues[1].length;
  // Add a violator count to the query.
  query.violatorCount = violatorCount === 1 ? '1 violator was' : `${violatorCount} violators were`;
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const weightName = getWeightName(weight);
    const weightIssues = issues[weight];
    // If any reported issues have the weight:
    if (weightIssues.length) {
      // Initialize lines for the weight details query property.
      const detailsLines = [];
      // For each issue with the weight:
      weightIssues.forEach(issueData => {
        const weightIssueCount = weightIssues.length;
        // Add the issue count to the query.
        query[`${weightName}Count`] = weightIssueCount;
        const {
          issueID,
          reporterCount,
          reporterList,
          summary,
          violatorCount,
          wcag,
          why
        } = issueData;
        const wcagLink = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
        // Add the start of a list item to the lines.
        detailsLines.push(`${margin}  <li>`);
        // Add a heading summarizing the issue to the lines.
        detailsLines.push(`${margin}    <h5>${summary}</h5>`);
        // Add the start of a fact list about the issue to the lines.
        detailsLines.push(`${margin}    <ul class="pseudoTopLevel">`);
        // Add the issue facts to the lines.
        detailsLines.push(`${margin}      <li>Why it matters: ${why}`);
        detailsLines.push(`${margin}      <li>Related WCAG standard: ${wcagLink}`);
        const reporterCountString = reporterCount === 1 ? '1 tool' : `${reporterCount} tools`;
        detailsLines.push(
          `${margin}      <li>Reported by ${reporterCountString} (${reporterList})</li>`
        );
        const violatorCountString = violatorCount === 1
        ? '1 violator was'
        : `${violatorCount} violators were`;
        detailsLines.push(`${margin}      <li>${violatorCountString} reported</li>`);
        // Add the end of the fact list to the lines.
        detailsLines.push(`${margin}    </ul>`);
        // Add the start of a link list to the lines.
        detailsLines.push(`${margin}    <ul class="nav">`);
        const whereQuestionString = 'Where was the issue found?';
        const labelString = `Where was the ${summary} issue found on the ${what} page?`;
        const href = `href="/reportIssue.html/${issueID}/${timeStamp}/${jobID}"`;
        const label = `aria-label="${labelString}"`;
        const whereLink = `<a ${href} ${label}>${whereQuestionString}</a>`;
        // Add a violations link to the lines.
        detailsLines.push(`${margin}      <li>${whereLink}</li>`);
        // Add the end of the link list to the lines.
        detailsLines.push(`${margin}    </ul>`);
        // Add the end of the list item to the lines.
        detailsLines.push(`${margin}  </li>`);
      });
      // Add the weight details lines to the query.
      query[`${weightName}Details`] = detailsLines.join('\n');
    }
    // Otherwise, i.e. if no reported issues have the weight:
    else {
      query[`${weightName}Details`] = `${margin}  <li>None</li>`;
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
