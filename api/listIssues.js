/*
  listIssues.js
  Returns a response containing details about one report and basics about the issues in it.
*/

// IMPORTS

const {
  getReportBasics,
  getReportDetails,
  getResponseMetadata,
  getToolsFacts
} = require('./util');
const {getReport, objectSort, ruleEngines} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for a list of issues in one report.
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
    // Add the basics about the report to the response content.
    responseContent['basics about the report'] = await getReportBasics(timeStamp, jobID);
  }
  // If getting the report and its basics succeeded:
  if (! responseContent['basics about the report'].error) {
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
  const content = {
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
  return content;
};
