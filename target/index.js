/*
  index.js
  Answers the target question.
*/

// IMPORTS

const {
  alphaSort,
  getIssue,
  getReporterString,
  getReportPath,
  getWeightName,
  objectSort,
  violatorSort
} = require('../util');
const fs = require('fs/promises');
const {issues} = require('testilo/procs/score/tic');
const {tools} = require('testaro/procs/job');

// FUNCTIONS

// Returns a date string from a time stamp.
const getDateString = timeStamp =>
  `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
// Returns a time string from a time stamp.
const getTimeString = timeStamp => `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
// Returns a description of a tool count.
const getToolCountString = toolCount => toolCount === 1 ? '1 tool' : `${toolCount} tools`;
// Returns data on rule violations in a report.
const getReportData = report => {
  // Initialize the data.
  const reportData = {
    issueCount: 0,
    reporters: new Set(),
    solos: new Set(),
    weights: []
  };
  [4, 3, 2, 1].forEach(weight => {
    reportData.weights.push({
      weightName: getWeightName(weight),
      issueCount: 0,
      issues: {}
    });
  });
  const {issueCount, reporters, solos, weights} = reportData;
  const {acts} = report;
  // For each act in the report:
  acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const toolID = act.which;
      const instances = act.result?.standardResult?.instances ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        // Get the issue that its rule belongs to.
        const issueID = getIssue(toolID, instance.ruleID);
        // If the acquisition succeeded:
        if (issueID) {
          // If the rule is not deprecated:
          if (issueID !== 'ignorable') {
            const issue = issues[issueID];
            const {weight} = issue;
            const weightData = reportData.weights[4 - weight];
            const weightIssues = weightData.issues;
            // If the issue has not yet been encountered:
            if (! weightIssues[issueID]) {
              // Add the classifier data on the issue to the data.
              weightIssues[issueID] = issues[issueID];
              // Increment the issue counts.
              reportData.issueCount++;
              weightData.issueCount++;
              const issueData = weightData[issueID];
              // Add initialized violation data to them.
              issueData.violationCount = 0;
              issueData.reporters = new Set();
              issueData.violators = {};
            }
            // Increment the violation count of the issue.
            issueData.violationCount += instance.count ?? 1;
            const {reporters, violators} = issueData;
            const violatorID = instance.catalogIndex ?? instance.pathID;
            // Ensure that the tool is included in the reporters of the issue.
            reporters.add(toolID);
            // If the instance discloses a catalog index or path ID:
            if (violatorID) {
              violators[violatorID] ??= new Set();
              const violator = violators[violatorID];
              // Ensure that the tool is included in the reporters of the violator.
              violator.add(toolID);
            }
          }
        }
        // Otherwise, i.e. if the acquisition failed:
        else {
          const soloString = `${toolID}:${reportedRuleID}`;
          // Ensure that the rule will be reported as unclassified.
          solos.push(soloString);
        }
      });
    }
  });
  // If any rules were not classified:
  if (solos.size) {
    // Report them:
    console.log(`ERROR: Violations reported of unclassified rules:\n${JSON.stringify(Array.from(solos, null, 2))}`);
  }
  // Populate the issue count.
  reportData.issueCount = weights
  .reduce((count, currentWeight) => count +  Object.keys(currentWeight.issues).length, 0);
  // Repopulate the reporters as an array of reporter names.
  reportData.reporters = alphaSort(
    Array.from(reportData.reporters).map(toolID => tools[toolID])
  );
  // Repopulate the weight-specific issue data as a
  reportData.weights =
  // Initialize sets of reported issues and reporters.
  const reportedIssues = new Set();
  // const reporters = new Set();
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const weightIssues = tally.weights[4 - weight].issues;
    // Initialize an array to replace the issues object in the data.
    const issueArray = [];
    // For each issue with the weight:
    Object.keys(weightIssues).forEach(issueID => {
      // Ensure that the issue is included in the reported issues.
      reportedIssues.add(issueID);
      const issueData = weightIssues[issueID];
      // For each reporter of the issue:
      issueData.reporters.forEach(reporter => {
        // Ensure that the reporter is included in the reporters.
        reporters.add(reporter);
      });
      const issue = issues[issueID];
      const {summary, wcag, why} = issue;
      // Initialize an item to be added to the array.
      const issueItem = {
        issueID,
        summary,
        why,
        wcag,
        violatorCount: issueData.violatorCount,
        reporterCount: issueData.reporters.size,
        reporters: getReporterString(issueData.reporters)
      };
      // Initialize an array of data on the violators of any rule belonging to the issue.
      const violators = [];
      // Initialize a set of ensemble-describing strings.
      const ensembles = new Set();
      // For each violator of any rule belonging to the issue:
      Object.keys(issueData.violators).forEach(violatorID => {
        // Get a string describing the ensemble of its reporters.
        const ensembleString = getReporterString(issueData.violators[violatorID].reporters);
        // Ensure that the ensemble string is in the set.
        ensembles.add(ensembleString);
        // Add data on the violator to the array.
        violators.push({
          id: violatorID,
          ensembleString
        });
      });
      // Sort the data on the violators by violator ID.
      violatorSort(violators);
      // Initialize an array of the ensembles sorted alphabetically.
      const ensembleArray = alphaSort(Array.from(ensembles));
      // Sort the sorted array by decreasing ensemble size.
      ensembleArray.sort((a, b) => b.split(' + ').length - a.split(' + ').length);
      // Add an array of ensemble data to the the issue item.
      issueItem.ensembles = ensembleArray.map(ensembleString => ({
        reporters: ensembleString.split(' + '),
        violators: violators
        .filter(violator => violator.ensembleString === ensembleString)
        .map(violator => violator.id)
      }));
      // Add the issue item to the issue array.
      issueArray.push(issueItem);
    });
    // Sort the items in the issue array by decreasing reporter count.
    objectSort(issueArray, 'reporterCount', 'numericDown');
    // Replace the issues object for the weight in the tally with the issue array.
    reportData.weights[4 - weight].issues = issueArray;
  });
  // Add the issue count, reporter count, reporter list, and solos to the data.
  reportData.issueCount = reportedIssues.size;
  reportData.reporterCount = reporters.size;
  reportData.reporters = getReporterString(reporters);
  reportData.solos = Array.from(solos);
  // Return the data.
  return reportData;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (requestURL, query) => {
  const [timeStamp, jobID] = requestURL.split('/').slice(-2);
  const margin = ' '.repeat(6);
  // Get the report to be inspected.
  const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
  const report = JSON.parse(reportJSON);
  // Initialize data on the report.
  const reportData = getReportData(report);
  // Initialize an array of list-item lines.
  const lines = [];
  //////////// CONTINUE REFACTORING HERE
    // Add lines to the array.
    lines.push(`${margin}<li>${pageWhat}</li>`);
    lines.push(`${margin}  <ul>`);
    lines.push(`${margin}    <li>URL: <code>${pageURL}</code></li>`);
    lines.push(
      `${margin}    <li>Last tested on ${getDateString(timeStamp)} at ${getTimeString(timeStamp)} (job <code>${jobID}</code>)</li>`
    );
    lines.push(`${margin}    <li>Issues reported: ${issueSet.size}</li>`);
    lines.push(
      `${margin}    <li>Reported by ${getToolCountString(reporterSet.size)}: ${getReporterString(reporterSet)}</li>`
    );
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`)
  }
  query.testedPages = lines.join('\n');
};
// Returns a page answering the targets question.
exports.answer = async requestURL => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(requestURL, query);
  // Get the template.
  let template = await fs.readFile(`${__dirname}/index.html`, 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    template = template.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return template;
};
