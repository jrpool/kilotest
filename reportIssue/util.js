/*
  util.js
  Shared utilities.
*/

// IMPORTS

const {
  getAgoDays,
  getPathID,
  getReport,
  getReportData,
  getRuleEngineNames,
  getToolsFacts,
  getWCAGURL,
  getWeightName,
  isValidReport,
  objectSort
} = require('../util');
const {issuesClassification} = require('testilo/procs/score/tic');

// FUNCTIONS

// Gets data about an issue in a report.
exports.getIssueData = async (issueID, timeStamp, jobID) => {
  const classifiedIssue = issuesClassification[issueID];
  // If the issue ID is deprecated or unclassified:
  if (issueID === 'ignorable' || ! classifiedIssue) {
    // Return this.
    return {
      error: 'Issue ID is deprecated or unclassified'
    };
  }
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If it is invalid:
  if (! isValidReport(report)) {
    // Return this.
    return {
      error: 'Report is invalid or not available'
    };
  }
  // Get global data from the report.
  const {acts, catalog, jobData, target} = report;
  const {preventions} = jobData;
  const daysAgo = getAgoDays(timeStamp);
  // Get data about the target.
  const {what, url} = target;
  // Get data about the classified issue.
  const {summary, wcag, weight, why} = classifiedIssue;
  // Initialize the data.
  const data = {
    target: {
      what,
      url,
      daysAgo
    },
    issue: {
      summary,
      why,
      wcag,
      wcagURL: getWCAGURL(wcag),
      weight,
      priority: getWeightName(weight)
    },
    ruleEngineCount: 0,
    ruleEngineIDs: new Set(),
    ruleEngines: [],
    preventions,
    reporterCount: 0,
    reporterIDs: new Set(),
    reporterNames: [],
    violatorCount: 0,
    violators: {}
  };
  const {reporterIDs, ruleEngineIDs, violators} = data;
  const testActs = acts.filter(act => act.type === 'test');
  // For each test act in the report:
  testActs.forEach(act => {
    const {result, which} = act;
    // Ensure that its rule engine is in the set of rule engines.
    ruleEngineIDs.add(which);
    // Get the standard instances of the issue.
    const issueInstances = result?.standardResult?.instances?.filter(
      instance => instance.issueID === issueID
    ) ?? [];
    // For each of them:
    issueInstances.forEach(instance => {
      // Ensure that the rule engine of the act is in the set of issue reporters.
      reporterIDs.add(which);
      // Get data about the violator.
      const pathID = instance.pathID || '/html';
      const catalogIndex = instance.catalogIndex || '0';
      const tagName = catalog[catalogIndex]?.tagName
      ?? pathID?.split('/').pop().replace(/\[.+$/, '').toUpperCase()
      ?? 'HTML';
      violators[catalogIndex] ??= {
        pathID: getPathID(catalog, catalogIndex, pathID),
        tagName,
        text: catalog[catalogIndex]?.text ?? '',
        reporterCount: 0,
        reporterIDs: new Set(),
        reporterNames: []
      };
      // Ensure that the rule engine is in the set of reporters of the violator.
      violators[catalogIndex].reporterIDs.add(which);
      // If the instance has a path ID but the violator does not yet have one:
      if (instance.pathID && ! violators[catalogIndex].pathID) {
        // Make the instance path ID the path ID of the violator.
        violators[catalogIndex].pathID = instance.pathID;
      }
    });
  });
  // Add the aggregate data to the data.
  data.ruleEngineCount = ruleEngineIDs.size;
  data.ruleEngines = getToolsFacts(ruleEngineIDs);
  data.reporterCount = reporterIDs.size;
  data.reporterNames = getRuleEngineNames(reporterIDs);
  data.violatorCount = Object.keys(violators).length;
  // For each violator:
  Object.values(violators).forEach(violatorData => {
    // Add the aggregate data to its data.
    violatorData.reporterCount = violatorData.reporterIDs.size;
    violatorData.reporterNames = getRuleEngineNames(violatorData.reporterIDs);
    // Delete unneeded data.
    delete violatorData.reporterIDs;
  });
  // Convert the data about issue violators to an array.
  data.violators = Object.entries(violators).map(entry => ({
    catalogIndex: entry[0],
    ... entry[1]
  }));
  // Sort the violators in XPath order.
  objectSort(data.violators, 'pathID', 'alpha');
  // Delete unneeded data.
  delete data.ruleEngineIDs;
  delete data.reporterIDs;
  // Return the data.
  return data;
};
// Get data for a response.
exports.getData = async (issueID, timeStamp, jobID) => ({
  reportData: await getReportData(timeStamp, jobID),
  issueData: await getIssueData(issueID, timeStamp, jobID)
});
