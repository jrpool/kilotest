/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getPageData,
  getPageDataStrings,
  getReport,
  getToolList,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isHidden,
  isValidReport,
  objectSort,
  tools
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns data on the issues reported by a report.
const getIssuesData = async (timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If it exists and is hidden:
  if (reportIsHidden) {
    return {error: 'Report is not available'}
  }
  // Otherwise, if it exists and is valid:
  if (isValidReport(report)) {
    // Initialize the temporary data.
    const temp = {
      issues: {},
      reporters: new Set(),
      violators: new Set()
    };
    // Initialize the final data.
    const final = {
      reporters: [],
      reporterList: '',
      reporterCount: 0,
      violatorCount: 0,
      preventions: report.jobData.preventions,
      issues: {
        4: [],
        3: [],
        2: [],
        1: []
      },
      issueCount: 0
    };
    // For each act in the report:
    report.acts.forEach(act => {
      // If it is a test act:
      if (act.type === 'test') {
        const {result, which} = act;
        const instances = result?.standardResult?.instances ?? [];
        // For each of its standard instances:
        instances.forEach(instance => {
          const {catalogIndex, issueID} = instance;
          // If the instance identifies its rule as belonging to a non-ignorable issue:
          if (issueID && issueID !== 'ignorable') {
            const issueClassification = issuesClassification[issueID];
            // If the issue has a current weighted classification:
            if (issueClassification && [1, 2, 3, 4].includes(issueClassification.weight)) {
              const {summary, wcag, weight, why} = issueClassification;
              // Initialize the temporary data on the issue if necessary.
              temp.issues[issueID] ??= {
                issueID,
                summary,
                wcag,
                why,
                weight,
                reporters: new Set(),
                reporterList: '',
                violators: new Set()
              };
              // Ensure the tool is in the temporary data.
              temp.issues[issueID].reporters.add(which);
              temp.reporters.add(which);
              // If the instance has a catalog index:
              if (catalogIndex) {
                // Ensure the violator is in the temporary data.
                temp.issues[issueID].violators.add(catalogIndex);
                temp.violators.add(catalogIndex);
              }
            }
          }
        });
      }
    });
    // Finish populating the final data.
    final.reporterList = getToolList(temp.reporters);
    final.reporterCount = temp.reporters.size;
    final.violatorCount = temp.violators.size;
    Object.values(temp.issues).forEach(issue => {
      const {issueID, summary, wcag, why, weight} = issue;
      const finalIssue = {
        issueID,
        summary,
        wcag,
        why,
        weight
      };
      finalIssue.reporterList = getToolList(issue.reporters);
      finalIssue.reporterCount = issue.reporters.size;
      finalIssue.violatorCount = issue.violators.size;
      final.issues[issue.weight].push(finalIssue);
    });
    final.issueCount = Object.keys(temp.issues).length;
    // For each weight:
    [4, 3, 2, 1].forEach(weight => {
      // Sort its issues in the final data alphabetically by reporter names.
      objectSort(final.issues[weight], 'reporterList', 'alpha');
      // Sort the issues again in descending reporter-count order, making this the primary order.
      objectSort(final.issues[weight], 'reporterCount', 'numericDown');
    });
    // Return the data.
    return final;
  }
  // Otherwise, i.e. if it is invalid or does not exist, return this.
  return {error: 'Report missing or invalid.'};
};
// Get page and issues data from a report.
const getData = async (timeStamp, jobID) => {
  const pageData = await getPageData(timeStamp, jobID);
  const issuesData = await getIssuesData(timeStamp, jobID);
  const pageError = pageData.error || '';
  const issuesError = issuesData.error || '';
  const errors = [pageError, issuesError].filter(Boolean).join('; ');
  // If the data of either type are missing or invalid:
  if (errors) {
    // Return this.
    return {error: errors};
  }
  // Otherwise, return the data.
  return {
    pageData,
    issuesData
  };
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp, jobID, query) => {
  // Get data on the target and its issues according to the report.
  const data = await getData(timeStamp, jobID);
  const {pageData, issuesData} = data;
  // If this failed:
  if (data.error) {
    // Populate the query with the reason.
    query.error = data.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, get fact descriptions for the target.
  const pageInfo = await getPageDataStrings(timeStamp, jobID, pageData);
  const {testInfo, urlLink, what} = pageInfo;
  // If this failed:
  if (pageInfo.error) {
    // Populate the query with the reason.
    query.error = pageInfo.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, add target data to the query.
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
  query.reporterCount = reporterCount === 1 ? '1 rule engine' : `${reporterCount} rule engines`;
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
        const reporterCountString = reporterCount === 1 ? '1 rule engine' : `${reporterCount} rule engines`;
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
  // If this failed:
  if (query.error) {
    // Return the error.
    return {
      status: 'error',
      message: query.error
    };
  }
  // Otherwise, if it succeeded and the report facts were obtained:
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
    message: 'Report facts not obtained'
  };
};
