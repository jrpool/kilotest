/*
  listIssues.js
  Returns details about one report and basics about the issues in it.
*/

// IMPORTS

const {
  getReportBasics,
  getResponseMetadata,
  getToolsFacts
} = require('./util');
const {getDateTime, getReport, objectSort, ruleEngines} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the facts about a rule engine.
const getRuleEngineFacts = ruleEngineID => {
  const ruleEngineData = ruleEngines[ruleEngineID] || [null, null];
  return {
    identifier: ruleEngineID,
    name: ruleEngineData[0] || null,
    sponsor: ruleEngineData[1] || null
  };
};
// Returns the details about a report, not including the IDs of the issues in it.
const getReportDetails = report => {
};
// Returns the response body.
exports.response = async (args) => {
  const [timeStamp, jobID] = args;
  // Get facts about the tool collection.
  const toolsFacts = getToolsFacts();
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'details about the report': null,
    'basics about the issues reported': null
  };
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (report.error) {
    // Add this to the response content.
    responseContent['basics about the report'] = report;
  }
  // Otherwise, i.e. if it succeeded:
  else {
    const {
      strict = null, standard = null, device = 'default', browserID = null, executionTimeStamp = null
    } = report;
    // Get details about the job definition.
    const jobDefinitionDetails = {
      'whether the job prohibited redirection': strict,
      'whether the report includes native results of rule engines': ['also', 'no'].includes(standard),
      'whether the report includes standardized results': ['also', 'only'].includes(standard),
      'device that was emulated by the job': device,
      'browser type that was used by the job': browserID,
      'when Kilotest made the job available to be performed': getDateTime(executionTimeStamp)
    };
    // Initialize data about the test results.
    const ruleEngineIDs = new Set();
    const reporterIDs = new Set();
    const issueIDs = new Set();
    const violatorIndexes = new Set();
    // For each act in the report:
    report.acts.forEach(act => {
      // If the act is a test act:
      if (act.type === 'test') {
        const {result, which} = act;
        // Ensure its rule engine is in the result data.
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
            // Ensure the issue ID is in the result data.
            issueIDs.add(issueID);
            // Ensure its rule engine is a reporter in the result data.
            reporterIDs.add(which);
            // If the instance has a catalog index:
            if (catalogIndex) {
              // Ensure the index of the violator is in the result data.
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
    // Get the details about the rule engines that could not test the page.
    const preventionFacts = preventions?.map(([ruleEngineID, reason]) => ({
      'name': ruleEngines[ruleEngineID][0],
      'reason for failure': reason
    }));
    const sortedPreventionFacts = objectSort(preventionFacts ?? [], 'name', 'alpha');
    const weightCounts = [0, 0, 0, 0];
    // For each issue:
    issueIDs.forEach(issueID => {
      const issueClassification = issuesClassification[issueID];
      // Increment the count of issues with its weight.
      weightCounts[issueClassification.weight - 1]++;
    });
    // Get details about the test results.
    const resultDetails = {
      'rule engines that tried to test the page': sortedRuleEngineIDs
      .map(id => getRuleEngineFacts(id)),
      'rule engines that could not test the page': sortedPreventionFacts,
      'names of rule engines that reported rule violations': Array
      .from(reporterIDs)
      .map(id => getRuleEngineFacts(id).name)
      .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})),
      'counts of issues by priority': {
        'highest': weightCounts[3],
        'high': weightCounts[2],
        'low': weightCounts[1],
        'lowest': weightCounts[0]
      },
      'number of elements reported as violators': violatorIndexes.size
    };
    // Return the details about the job definition and the test results.
    return {
      'job definition': jobDefinitionDetails,
      'test results': resultDetails
    };
  }
    // Add the basics about the report to the response content.
    responseContent['basics about the report'] = await getReportBasics(timeStamp, jobID);
    // Get details about the report.
    responseContent['details about the report'] = getReportDetails(report);
    // Initialize data about the basics about the issues reported.
    const issuesBasics = {};
    // For each act in the report:
    report.acts.forEach(act => {
      const {result, type, which} = act;
      // If it is a test act:
      if (type === 'test') {
        const instances = result?.standardResult?.instances ?? [];
        // For each of the standard instances of the act:
        instances.forEach(instance => {
          const {issueID} = instance;
          const issueClassification = issuesClassification[issueID];
          const {summary, weight, why} = issueClassification;
          // If the instance has a non-ignorable issue, is classified, and has a valid weight:
          if (
            issueID
            && issueID !== 'ignorable'
            && summary
            && [1, 2, 3, 4].includes(weight)
            && why
          ) {
            // Ensure the issue is in the data.
            issuesBasics[issueID] ??= {
              id: issueID,
              summary,
              weight,
              why,
              reporterIDs: [which]
            };
          }
        });
      }
    });
    const sortedIssuesBasics = objectSort(Object.values(issuesBasics), 'id', 'alpha');
    responseContent['basics about the issues reported'] = sortedIssuesBasics.map(issueBasics => {
      const {id, summary, weight, why, reporterIDs} = issueBasics;
      return {
        identifier: id,
        summary,
        priority: ['lowest', 'low', 'high', 'highest'][weight - 1],
        'impact on a user': why,
        'rule engines that reported violations of rules belonging to the issue': reporterIDs
        .map(reporterID => ruleEngines[reporterID][0])
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      };
    });
  }
  // Create a response body.
  const body = {
    'tool collection': toolsFacts,
    'tool name': 'listIssues',
    request: {
      description: 'Provide details about one report, including basics about the issues reported in it. The timeStamp and jobID parameters identify the report that I want details about. Those parameters were in the response to my earlier listReports request.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
        'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': null
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
