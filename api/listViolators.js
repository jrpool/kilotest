/*
  listViolators.js
  Returns a response containing basics about one issue in one report and a list of its violators.
*/

// IMPORTS

const {
  getIssueBasics,
  getKilotestBasics,
  getReportBasics,
  getReportDetails,
  getReportIfOK,
  getResponseMetadata,
  getRuleEngineFacts,
  getViolatorBasics
} = require('./util');
const {
  getDateTime,
  getNowStamp,
  getRandomString,
  getReport,
  getToolsFacts,
  isHidden,
  tools
} = require('../util');

// FUNCTIONS

// Returns a response to an API request for a list of violators of one issue in one report.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
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
  const {issueCount, issues, preventions, reporterCount, reporters, violatorCount} = issuesData;
  let issue;
  // Otherwise, i.e. if it succeeded, get the level of and the data on the issue.
  const issueLevel = [4, 3, 2, 1].find(level => {
    issue = issues[level].find(issue => issue.issueID === issueID);
    return issue;
  });
  // If the issue was not one of those in the report:
  if (! issue) {
    // Return this.
    return {
      status: 'error',
      message: 'Issue not found in the report'
    };
  }
  const preventedTools = Object.entries(preventions).map(prevention => ({
    name: tools[prevention[0]][0],
    'reason for failure': prevention[1]
  }));
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
