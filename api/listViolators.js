/*
  listViolators.js
  Returns details about one issue in one report and basics about all its violators.
*/

// IMPORTS

const {
  getIssueBasics,
  getReportBasics,
  getResponseMetadata,
  getToolsFacts,
  getViolatorBasics
} = require('./util');
const {
  getDateTime,
  getNowStamp,
  getRandomString,
  getReport,
  isHidden,
  tools
} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the details about an issue in a report, not including a list of its violators.
exports.getIssueDetails = (issueID, report) => {
  // Initialize data about the issue.
  const reporterIDs = new Set();
  const violatorIndexes = new Set();
  // For each act in the report:
  report.acts.forEach(act => {
    // If the act is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each of the standard instances of the act:
      instances.forEach(instance => {
        // If the instance has the issue:
        if (instance.issueID === issueID) {
          // Ensure the rule engine is a reporter in the data.
          reporterIDs.add(which);
          const {catalogIndex} = instance;
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure it is a violator in the data.
            violatorIndexes.add(catalogIndex);
          }
        }
      });
    }
  });
  // Return the details.
  return {
    'names of rule engines with violated rules belonging to the issue': Array.from(reporterIDs),
    'count of violators, i.e. elements exhibiting the issue': violatorIndexes.size
  };
};
// Returns the response body.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
  // Get facts about the tool collection.
  const toolsFacts = getToolsFacts();
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'details about the issue': null,
    'basics about the violators of rules belonging to the issue': null
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
    // Add the basics about the report to the response content.
    responseContent['basics about the report'] = await getReportBasics(timeStamp, jobID);
    // Get the issue classification.
    const issueClassification = issuesClassification[issueID];
    const {summary, weight, why} = issueClassification;
    // If the instance has a non-ignorable and fully classified issue:
    if (
      issueID
      && issueID !== 'ignorable'
      && issueClassification
      && [1, 2, 3, 4].includes(weight)
      && why
    ) {
      // Initialize data about the instances of the issue.
      const ruleEngineIDs = new Set();
      const violatorIndexes = new Set();
      // For each act in the report:
      report.acts.forEach(act => {
        const {result, type, which} = act;
        // If the act is a test act with a specified rule engine:
        if (type === 'test' && which) {
          const instances = result?.standardResult?.instances ?? [];
          // For each of the standard instances of the act:
          instances.forEach(instance => {
            const {catalogIndex} = instance;
            // If the instance has the issue ID:
            if (instance.issueID === issueID) {
              // Ensure the rule-engine ID is in the data.
              ruleEngineIDs.add(which);
              // If the instance has a catalog index:
              if (catalogIndex) {
                // Ensure the catalog index is in the data.
                violatorIndexes.add(catalogIndex);
              }
            }
          });
        }
      });
      // Initialize the basics about the violators.
      const violatorsBasics = [];
      // Get the violator catalog indexes, sorted by DOM order.
      const sortedViolatorIndexes = Array
      .from(violatorIndexes)
      .sort((a, b) => Number(a) - Number(b));
      // For each violator:
      sortedViolatorIndexes.forEach(violatorIndex => {
        const catalogItem = report.catalog[violatorIndex];
        // Get the basics about it.
        const violatorBasics = {
          'index in the DOM': Number(violatorIndex),
          ''
        }
        // Add the catalog index to the basics about the violators.
        violatorsBasics.push({
          catalogIndex: violatorIndex
        });
      });
      // Add the catalog indexes of the violators of rules belonging to the issue to the data.
      responseContent['basics about the violators of rules belonging to the issue'] = {
        issueID,
        summary,
        weight,
        why,
        violatorIndexes: Array.from(violatorIndexes)
      };
    }


  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by a language model to a Kilotest tool. The model requested data, drawn from a Kilotest report, about one of the issues for the front-end quality (i.e. accessibility, usability, and standards conformity) of a web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes several API endpoints to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advantages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'describeOneIssueFromOneReport',
    request: {
      'type of request': {
        identifier: 'reportIssue',
        description: 'Describe one issue from one report.'
      },
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
        'for HTML output': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        identifier: 'summarizeOneReport',
        description: 'Summarize one report.',
        URLs: {
          'for JSON output': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
          'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString()
    },
    report: {
      identifier: `${timeStamp}-${jobID}`,
      'creation date': getDateTime(timeStamp),
      'days since the creation date': daysAgo
    },
    'tested web page': {
      description: what,
      URL: url
    },
    'rule engines that tried to test the page': getToolsFacts(Object.keys(tools)),
    'rule engines that were unable to test the page': preventedTools,
    'rule engines that reported issues': {
      number: reporterCount,
      names: reporters.map(tool => tool.toolName)
    },
    'number of issues reported': {
      total: issueCount,
      'by priority': {
        'highest priority': issues[4].length,
        'high priority': issues[3].length,
        'low priority': issues[2].length,
        'lowest priority': issues[1].length
      }
    },
    'number of HTML elements reported as exhibiting issues': violatorCount,
    'level of the issue': issueLevel,
    'facts about the issue': await getIssueFacts(issue, timeStamp, jobID)
  };
  return content;
};
