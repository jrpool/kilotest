/*
  util.js
  Shared utilities.
*/

// IMPORTS

const {
  getPageDataStrings,
  getPathID,
  getReport,
  getToolNamesString,
  getWCAGURL,
  getWeightName,
  isValidReport
} = require('../util');
const {issuesClassification} = require('testilo/procs/score/tic');

// FUNCTIONS

// Gets data about an issue in a report.
exports.getData = async (issueID, timeStamp, jobID) => {
  const issue = issuesClassification[issueID];
  // If the issue ID is deprecated or unclassified:
  if (issueID === 'ignorable' || ! issue) {
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
  const {acts, catalog, jobData} = report;
  const {preventions} = jobData;
  // Get data about the target.
  const pageDataStrings = await getPageDataStrings(timeStamp, jobID);
  const {what, url, urlLink, testInfo} = pageDataStrings;
  const classifiedIssue = issuesClassification[issueID];
  const {summary, wcag, weight, why} = classifiedIssue;
  // Initialize the data.
  const data = {
    target: {
      what,
      url,
      urlLink,
      testInfo
    },
    issue: {
      summary,
      why,
      wcag,
      weight,
      priority: getWeightName(weight),
      wcagURL: getWCAGURL(wcag)
    },
    ruleEngineCount: 0,
    ruleEngineIDs: new Set(),
    ruleEngineList: '',
    preventions,
    reporterCount: 0,
    reporterIDs: new Set(),
    reporterList: '',
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
    // Get the instances of the issue.
    const issueInstances = result?.standardResult?.instances?.filter(
      instance => instance.issueID === issueID
    ) ?? [];
    // For each standard instance whose rule belongs to the issue:
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
        reporterList: ''
      };
      // Ensure that the rule engine is in the set of reporters of the violator.
      violators[catalogIndex].reporterIDs.add(which);
      // If the instance has an XPath but the violator does not yet have one:
      if (instance.pathID && ! violators[catalogIndex].pathID) {
        // Make the instance XPath the path ID of the violator.
        violators[catalogIndex].pathID = instance.pathID;
      }
    });
  });
  // Add the aggregate data to the data.
  data.ruleEngineCount = ruleEngineIDs.size;
  data.ruleEngineList = getToolNamesString(ruleEngineIDs);
  data.reporterCount = reporterIDs.size;
  data.reporterList = getToolNamesString(reporterIDs);
  data.violatorCount = Object.keys(violators).length;
  // For each violator:
  Object.values(violators).forEach(violatorData => {
    // Add the aggregate data to its data.
    violatorData.reporterCount = violatorData.reporterIDs.size;
    violatorData.reporterList = getToolNamesString(violatorData.reporterIDs);
    // Delete unneeded data.
    delete violatorData.reporterIDs;
  });
  // Convert the data about issue violators to an array.
  data.violators = Object.entries(violators).map(entry => ({
    catalogIndex: entry[0],
    ... entry[1]
  }));
  // Sort the violators in XPath order.
  data.violators.sort((a, b) => a.pathID.localeCompare(b.pathID));
  // Delete unneeded data.
  delete data.ruleEngineIDs;
  delete data.reporterIDs;
  // Return the data.
  return data;
};
