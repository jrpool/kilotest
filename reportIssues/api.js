/*
  api.js
  Responds to the report-issues request.
*/

// IMPORTS

const {getData} = require('./util');
const {
  getDateTime,
  getNowStamp,
  getRandomString,
  getToolsFacts,
  isHidden,
  tools
} = require('../util');

// FUNCTIONS

// Gets facts about an issue.
const getIssueFacts = (thisHost, timeStamp, jobID, issue) => {
  const {issueID, reporterCount, reporters, summary, violatorCount, wcag, why} = issue;
  const wcagType = wcag.length === 3 ? 'guideline' : 'success criterion';
  return {
    identifier: issueID,
    summary,
    'related WCAG 2.2 standard': {
      layer: wcagType,
      'numeric identifier': wcag
    },
    'impact on a user': why,
    'rule engines reporting the issue': {
      'number': reporterCount,
      'names': reporters.map(tool => tool.toolName)
    },
    'number of HTML elements reported as exhibiting the issue': violatorCount,
    'URLs for details about the issue on the page': {
      'for you': `${thisHost}/api/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for humans': `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
    }
  };
};
// Returns a response to a report-issues request.
exports.response = async args => {
  const [timeStamp, jobID] = args;
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  // Otherwise, i.e. if the report is available, get data on the target and issues.
  const data = await getData(timeStamp, jobID);
  const {pageData, issuesData} = data;
  const {what, url, daysAgo} = pageData;
  const {issueCount, issues, preventions, reporterCount, reporters, violatorCount} = issuesData;
  const preventedTools = Object.entries(preventions).map(prevention => ({
    name: tools[prevention[0]][0],
    'reason for failure': prevention[1]
  }));
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by a language model to a Kilotest tool. The model requested data from a Kilotest report about the front-end quality (i.e. accessibility, usability, and standard-conformity) of a web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes several API endpoints to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advantages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'describeQualityOfOneWebPage',
    request: {
      'type of request': {
        identifier: 'reportIssues',
        description: 'Describe the quality of one web page.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/reportIssues/${timeStamp}/${jobID}`,
        'equivalent URL for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        identifier: 'getListOfAllAvailableReports',
        description: 'Get a list of all available reports.',
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
    'issues reported': {
      'highest priority': issues[4]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'high priority': issues[3]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'low priority': issues[2]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue)),
      'lowest priority': issues[1]
      .map(issue => getIssueFacts(thisHost, timeStamp, jobID, issue))
    }
  };
  return content;
};
