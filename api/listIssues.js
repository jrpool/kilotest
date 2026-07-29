/*
  listIssues.js
  Returns a response containing details about one report and a list of the issues in it.
*/

// IMPORTS

const {
  getIssueBasics,
  getReportBasics,
  getReportDetails,
  getReportIfOK,
  getResponseMetadata,
  getToolsFacts
} = require('./util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to an API request for a list of issues in one report.
exports.response = async (args) => {
  const [timeStamp, jobID] = args;
  // Get facts about the tool collection.
  const toolsFacts = getToolsFacts();
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
  const issuesBasics = Array
  .from(reportDetails.issueIDs)
  .map(id => getIssueBasics(id, timeStamp, jobID));
  // Create a response body.
  const content = {
    'tool collection': toolsFacts,
    'tool name': 'listIssues',
    request: {
      description: 'Provide details about one report, including a list of the issues reported in it and basics about each issue. The timeStamp and jobID parameters identify the report that I want details about. Those parameters were in the response to my earlier listReports request.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
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
