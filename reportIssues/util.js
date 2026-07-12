/*
  util.js
  Shared utilities.
*/

// IMPORTS

const {
  getPageData, getReport, getToolsData, getToolList, isHidden, isValidReport, objectSort
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

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
    final.reporters = getToolsData(temp.reporters);
    final.reporterList = getToolList(temp.reporters);
    final.reporterCount = final.reporters.length;
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
      finalIssue.reporters = getToolsData(issue.reporters);
      finalIssue.reporterList = getToolList(issue.reporters);
      finalIssue.reporterCount = finalIssue.reporters.length;
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
exports.getData = async (timeStamp, jobID) => {
  const pageData = await getPageData(timeStamp, jobID);
  const issuesData = await getIssuesData(timeStamp, jobID);
  const pageError = pageData.error || '';
  const issuesError = issuesData.error || '';
  const errors = [pageError, issuesError].join('; ');
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
