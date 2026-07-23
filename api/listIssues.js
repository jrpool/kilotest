/*
  listIssues.js
  Returns a response containing details about one report and a list of the issues in it.
*/

// IMPORTS

const {
  getIssueBasics,
  getReportBasics,
  getReportIfOK,
  getResponseMetadata,
  getResultDetails,
  getToolsFacts
} = require('./util');
const {getReportDetails} = require('../util');

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
