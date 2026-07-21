/*
  listIssues.js
  Returns a response containing details about one report and a list of the issues in it.
*/

// IMPORTS

const {getIssueBasics, getKilotestBasics, getReportBasics, getResponseMetadata} = require('./util');
const {
  getDateTime
  getNowStamp,
  getRandomString,
  getReport,
  isValidReport,
  objectSort,
  ruleEngines
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns facts about the acts of a report.
const getActsFacts = async (report) => {
  // Initialize the facts.
  const ruleEngineIDs = new Set();
  const reporterIDs = new Set();
  const issueIDs = new Set();
  const violatorIndexes = new Set();
  // If the report is valid:
  if (isValidReport(report)) {
    // For each act in it:
    report.acts.forEach(act => {
      // If the act is a test act:
      if (act.type === 'test') {
        const {result, which} = act;
        // Ensure its rule engine is in the facts.
        ruleEngineIDs.add(which);
        const instances = result?.standardResult?.instances ?? [];
        // For each of its standard instances:
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
            // Ensure the issue ID is in the facts.
            issueIDs.add(issueID);
            // Ensure its rule engine is among the reporters in the facts.
            reporterIDs.add(which);
            // If the instance has a catalog index:
            if (catalogIndex) {
              // Ensure the violator is in the facts.
              violatorIndexes.add(catalogIndex);
            }
          }
        });
      }
    });
  }
  // Return the facts.
  return {
    ruleEngineIDs,
    reporterIDs,
    issueIDs,
    violatorIndexes
  };
};
// Returns facts about a rule engine.
const getRuleEngineFacts = ruleEngineID => {
  const ruleEngineData = ruleEngines[ruleEngineID];
  return {
    identifier: ruleEngineID,
    name: ruleEngineData[0],
    sponsor: ruleEngineData[1]
  };
};
// Returns rule engine IDs sorted by name.
const getSortedRuleEngineIDs = ruleEngineIDSet => {
  return Array.from(ruleEngineIDSet).sort((a, b) => {
    const aName = ruleEngines[a][0];
    const bName = ruleEngines[b][0];
    return aName.localeCompare(bName, 'en', {sensitivity: 'base'});
  });
};
// Returns facts about rule engines that were prevented from testing the page.
const getPreventionFacts = report => {
  const {preventions} = report.jobData;
  const preventionFacts = preventions.map(([ruleEngineID, reason]) => ({
    'name': ruleEngines[ruleEngineID][0],
    'reason for failure': reason
  }));
  return objectSort(preventionFacts, 'name', 'alpha');
};
// Returns issue IDs sorted by priority and then summary.
const getSortedIssueIDs = issueIDSet => {
  return Array.from(issueIDSet).sort((a, b) => {
    const aData = issuesClassification[a];
    const bData = issuesClassification[b];
    if (aData.weight !== bData.weight) {
      return bData.weight - aData.weight;
    }
    return aData.summary.localeCompare(bData.summary, 'en', {sensitivity: 'base'});
  });
};
// Returns facts about an issue in a report.
const getIssueFacts = (issueID, timeStamp, jobID) => {
  const issueData = issuesClassification[issueID];
  if (! issueData) {
    return {
      error: `Issue ${issueID} not classified`
    };
  }
  const {summary, weight, why} = issueData;
  return {
    identifier: issueID,
    summary,
    'impact on a user': why,
    'priority': ['lowest', 'low', 'high', 'highest'][weight - 1],
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
};
// Returns a response to an API request for a summary of one report.
exports.response = async (args) => {
  const [timeStamp, jobID] = args;
  // Get the basic facts about Kilotest.
  const kilotestBasics = getKilotestBasics();
  // Get the basic facts about the report.
  const reportBasics = await getReportBasics(timeStamp, jobID);
  // If this failed, the log file is invalid, or the report is hidden:
  if (reportBasics.error) {
    // Log and return this.
    console.error(`Basics about report ${timeStamp}-${jobID} not obtained (${reportBasics.error})`);
    return {
      status: 'error',
      message: `No facts about reuort ${timeStamp}-${jobID} are available.`
    };
  }
  const {strict, standard, device, browserID, executionTimeStamp} = report;
  // Otherwise, get details about the report.
  const reportDetails = {
    'whether the job permitted redirection': !! strict,
    'whether the report includes native results of rule engines': ['also', 'no'].includes(standard),
    'whether the report includes standardized results': ['also', 'only'].includes(standard),
    'device that was emulated by the job': device,
    'browser type that was used by the job': browserID,
    'when Kilotest made the job available to be performed': getDateTime(executionTimeStamp)
  };
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
    'number of elements reported as violators': violatorIndexes.size,
    'issues reported': Array.from(issueIDs).map(id => getIssueBasics(id, timeStamp, jobID))
  };
  // Create a response body.
  const content = {
    ... kilotestBasics,
    'tool name': 'listIssues',
    request: {
      description: 'Provide detailed facts about one report, including a list of the issues reported in it. For each issue, the list should state what the issue summarily is, how it tends to affect a user, which priority level it is classified as having, and which URL I can use for incremental retrieval of facts about violators (namely, elements exhibiting the issue).',
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
      'details about the test results': resultDetails
    }
  };
  // Return it.
  return content;
};
