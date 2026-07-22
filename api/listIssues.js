/*
  listIssues.js
  Returns a response containing details about one report and a list of the issues in it.
*/

// IMPORTS

const {
  getIssueBasics,
  getKilotestBasics,
  getReportBasics,
  getReportIfOK,
  getResponseMetadata,
  getRuleEngineFacts
} = require('./util');
const {
  getReportDetails,
  getReportIfOK,
  objectSort,
  ruleEngines
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for a list of issues in one report.
exports.response = async (args) => {
  const [timeStamp, jobID] = args;
  // Get the basics about Kilotest.
  const kilotestBasics = getKilotestBasics();
  // Get the basics about the report.
  const reportBasics = await getReportBasics(timeStamp, jobID);
  // Get the report or an error message.
  const report = await getReportIfOK(timeStamp, jobID, reportBasics.error);
  // If it is an error message:
  if (report.status === 'error') {
    // Return it.
    return report;
  }
  // Otherwise, get details about the report.
  const reportDetails = getReportDetails(report);
  // Initialize details about the test results.
  const ruleEngineIDs = new Set();
  const reporterIDs = new Set();
  const issueIDs = new Set();
  const violatorIndexes = new Set();
  // For each act in the report:
  report.acts.forEach(act => {
    // If the act is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      // Ensure its rule engine is in the result details.
      ruleEngineIDs.add(which);
      const instances = result?.standardResult?.instances ?? [];
      // For each of the standard instances of the act:
      instances.forEach(instance => {
        const {catalogIndex, issueID} = instance;
        const issueClassification = issuesClassification[issueID];
        // If the instance has a non-ignorable issue, is classified, and has a valid weight:
        if (
          issueID
          && issueID !== 'ignorable'
          && issueClassification
          && [1, 2, 3, 4].includes(issueClassification.weight)
        ) {
          // Ensure the issue ID is in the result details.
          issueIDs.add(issueID);
          // Ensure its rule engine is a reporter in the result details.
          reporterIDs.add(which);
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure the index of the violator is in the result details.
            violatorIndexes.add(catalogIndex);
          }
        }
      });
    }
  });
  const sortedRuleEngineIDs = Array.from(ruleEngineIDs).sort((a, b) => {
    const aName = ruleEngines[a][0];
    const bName = ruleEngines[b][0];
    return aName.localeCompare(bName, 'en', {sensitivity: 'base'});
  });
  const {preventions} = report.jobData;
  const preventionFacts = preventions?.map(([ruleEngineID, reason]) => ({
    'name': ruleEngines[ruleEngineID][0],
    'reason for failure': reason
  }));
  const sortedPreventionFacts = objectSort(preventionFacts, 'name', 'alpha');
  // Get details about the test results.
  const resultDetails = {
    'rule engines that tried to test the page': sortedRuleEngineIDs
    .map(id => getRuleEngineFacts(id)),
    'rule engines that could not test the page': sortedPreventionFacts,
    'names of rule engines that reported rule violations': Array
    .from(reporterIDs)
    .map(id => getRuleEngineFacts(id).name)
    .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})),
    'number of elements reported as violators': violatorIndexes.size
  };
  const issuesBasics = Array.from(issueIDs).map(id => getIssueBasics(id, timeStamp, jobID));
  // Create a response body.
  const content = {
    'tool collection': kilotestBasics,
    'tool name': 'listIssues',
    request: {
      description: 'Provide detailed facts about one report, including a list of the issues reported in it. For each issue, the list should state what the issue is, how it tends to affect a user, which priority level it is classified as having, and which URL I can use for incremental retrieval of facts about violators (namely, elements exhibiting the issue). The timeStamp and jobID parameters identify the report that I want facts about. Those parameters were in the response to my earlier listReports request.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
        'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': {
      'basics about the report': reportBasics,
      'details about the report': reportDetails,
      'details about the test results': resultDetails,
      'issues reported': issuesBasics
    }
  };
  // Return it.
  return content;
};
