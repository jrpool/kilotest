/*
  api.js
  Responds to the reportSummary API request.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLogs,
  getNowStamp,
  getRandomString,
  getReportSize,
  isHidden,
  getJob,
  isValidJob,
  getReport,
  isValidReport,
  ruleEngines
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns facts about a report.
const getReportFacts = async (report) => {
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
      // If it has any standard instances:
      if (instances.length) {
        // Ensure its rule engine is among the reporters in the facts.
        facts.reporterIDs.add(which);
      }
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
          }
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure the violator is in the facts.
            facts.violators.add(catalogIndex);
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
  return Object.entries(report.jobData.preventions).map(([ruleEngineID, reason]) => ({
    'rule engine': getRuleEngineFacts(ruleEngineID).name,
    'reason for failure to test': reason
  }));
};
// Returns a response to an API request for a summary of one report.
exports.response = async (timeStamp, jobID) => {
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report does not exist:
  if (typeof reportIsHidden === 'string') {
    // Return this.
    return {
      error: 'Report not found',
    };
  }
  // Otherwise, if the report is hidden:
  if (reportIsHidden) {
    // Return this.
    return {
      error: 'Report not available',
    };
  }
  // Otherwise, i.e. if the report is available, get it.
  const report = await getReport(timeStamp, jobID);
  // Get facts about it.
  const reportFacts = await getReportFacts(report);
  // Create a response body.
  const content = {
    summary: 'This document fulfills a request made by a language model to a Kilotest tool. The model asked for a summary of one Kilotest report. The model had previously used the getlistOfAllAvailableReports tool and already had basic facts about the report provided by that tool. This summary does not repeat those facts.',
    'tool collection name': 'Kilotest',
    'tool name': 'getSummaryOfOneReport',
    request: {
      'type of request': {
        identifier: 'reportSummary',
        description: 'Get a summary of one report. The summary describes the rule engines that tested the page and the issues that were revealed by the reported rule violations.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/reportSummary/${timeStamp}/${jobID}`,
        'equivalent URL for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        'type of request': {
          identifier: 'reportList',
          description: 'Get a list of all available reports.'
        },
        method: 'GET',
        URLs: {
          'URL of your request': `${thisHost}/api/reportSummary/${timeStamp}/${jobID}`,
          'equivalent URL for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'summary of the report': {
      'rule engines that tried to test the page': reportFacts
      .ruleEngineIDs
      .map(id => getRuleEngineFacts(id)),
      'rule engines that could not test the page': getPreventionFacts(report),
      'rule engines that reported rule violations': reportFacts
      .reporterIDs
      .map(id => getRuleEngineFacts(id).name),
      'number of elements reported as violators': reportFacts.violators.size,
      'issues revealed by the reported rule violations': reportFacts.issueIDs.
    }
  };
  // Return it.
  return content;
};
