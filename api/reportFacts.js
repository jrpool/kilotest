/*
  reportFacts.js
  Responds to the reportFacts API request.
*/

// IMPORTS

const {getReportFacts} = require('./util');
const {
  getNowStamp,
  getRandomString,
  getReport,
  isHidden,
  objectSort,
  ruleEngines
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns facts about a report.
const getActFacts = async (report) => {
  // Initialize the facts.
  const facts = {
    ruleEngineIDs: new Set(),
    reporterIDs: new Set(),
    issueIDs: new Set(),
    violators: new Set()
  };
  // For each act in the report:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      // Ensure its rule engine is in the facts.
      facts.ruleEngineIDs.add(which);
      const instances = result?.standardResult?.instances ?? [];
      // For each of its standard instances:
      instances.forEach(instance => {
        const {catalogIndex, issueID} = instance;
        // If the instance identifies a non-ignorable issue:
        if (issueID && issueID !== 'ignorable') {
          const issueClassification = issuesClassification[issueID];
          // If the issue is classified and has a valid weight:
          if (issueClassification && [1, 2, 3, 4].includes(issueClassification.weight)) {
            // Ensure the issue ID is in the facts.
            facts.issueIDs.add(issueID);
            // Ensure its rule engine is among the reporters in the facts.
            facts.reporterIDs.add(which);
            // If the instance has a catalog index:
            if (catalogIndex) {
              // Ensure the violator is in the facts.
              facts.violators.add(catalogIndex);
            }
          }
        }
      });
    }
  });
  // Return the facts.
  return facts;
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
// Returns facts about rule engines that were prevented from testing the page.
const getPreventionFacts = report => {
  return objectSort(Object.entries(report.jobData.preventions).map(([ruleEngineID, reason]) => ({
    'name': getRuleEngineFacts(ruleEngineID).name,
    'reason for failure': reason
  })), 'name', 'alpha');
};
// Returns rule engine IDs sorted by name.
const getSortedRuleEngineIDs = ruleEngineIDSet => {
  return Array.from(ruleEngineIDSet).sort((a, b) => {
    const aData = ruleEngines[a][0];
    const bData = ruleEngines[b][0];
    return aData.localeCompare(bData, 'en', {sensitivity: 'base'});
  });
};
// Returns issue IDs sorted by priority and summary.
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
// Get facts about an issue.
const getIssueFacts = (issueID, timeStamp, jobID) => {
  const issueData = issuesClassification[issueID];
  const {summary, weight, why} = issueData;
  return {
    identifier: issueID,
    summary,
    'impact on a user': why,
    'priority': ['lowest', 'low', 'high', 'highest'][weight - 1],
    'URLs for more details': {
      'for you': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for humans': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
};
// Returns a response to an API request for a summary of one report.
exports.response = async (args) => {
  const [timeStamp, jobID] = args;
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report exists and is hidden:
  if (reportIsHidden) {
    // Return this.
    return {
      status: 'error',
      message: 'Report not available',
    };
  }
  // Otherwise, i.e. if the report is not hidden, get it.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (report.error) {
    // Return why.
    return {
      status: 'error',
      message: report.error
    };
  }
  // Otherwise, i.e. if it succeeded, get facts from its test acts.
  const actFacts = await getActFacts(report);
  const {issueIDs, reporterIDs, ruleEngineIDs, violators} = actFacts;
  // Get global facts about the report.
  const reportFacts = await getReportFacts(timeStamp, jobID);
  // If this failed:
  if (reportFacts.error) {
    // Return why.
    return {
      status: 'error',
      message: reportFacts.error
    };
  }
  // Otherwise, i.e. if it succeeded, delete the unneeded facts.
  delete reportFacts['URLs for more details'];
  // Create a response body.
  const content = {
    summary: 'This document fulfills a request made by a language model to a Kilotest tool. The model asked for facts about one Kilotest report. The model had previously used the listAllAvailableReports tool and had acquired from that tool basic facts about Kilotest, the ensemble testing that Kilotest performs, and the reports available from Kilotest. This document provides more detailed facts about one of the listed reports.',
    'tool collection name': 'Kilotest',
    'tool name': 'summarizeOneReport',
    request: {
      description: 'Summarize one report. The summary should briefly describe the testing job and the results, including the rule engines that tested the web page and the issues that were revealed by the reported rule violations, and should provide URLs for getting more detailed facts about any of the issues. The timeStamp and jobID parameters identify the report and were obtained from the response to a listAllAvailableReports operation.',
      method: 'GET',
      URLs: {
        'for you': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
        'for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        'tool name': 'listAllAvailableReports',
        description: 'List all available reports.',
        URLs: {
          'for you': `${thisHost}/api/reportList`,
          'for humans': `${thisHost}/targets.html`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString()
    },
    'response content': {
      ... reportFacts,
      'rule engines that tried to test the page': getSortedRuleEngineIDs(ruleEngineIDs)
      .map(id => getRuleEngineFacts(id)),
      'rule engines that could not test the page': getPreventionFacts(report),
      'names of rule engines that reported rule violations': Array
      .from(reporterIDs)
      .map(id => getRuleEngineFacts(id).name)
      .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})),
      'number of elements reported as violators': violators.size,
      'issues revealed': getSortedIssueIDs(issueIDs)
      .map(id => getIssueFacts(id, timeStamp, jobID))
    }
  };
  // Return it.
  return content;
};
