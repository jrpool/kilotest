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
  researchAgents,
  tools
} = require('../util');

// FUNCTIONS

// Gets facts about an issue.
const getIssueFacts = (thisHost, agentID, timeStamp, jobID, issue) => {
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
    'tools reporting the issue': {
      'number': reporterCount,
      'names': reporters.map(tool => tool.toolName)
    },
    'number of HTML elements reported as exhibiting the issue': violatorCount,
    'URLs for details about the issue on the page': {
      'for you': `${thisHost}/api/${agentID}/reportIssue/${issueID}/${timeStamp}/${jobID}`,
      'for humans': `${thisHost}/reportIssue/${issueID}/${timeStamp}/${jobID}`
    }
  };
};
// Returns a response to a target-issues request.
exports.response = async args => {
  const [agentID, timeStamp, jobID] = args;
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
  const response = {
    summary: `This document fulfills a request made by an agent to the Kilotest service. The agent requested data from a Kilotest report about the accessibility, usability, and standard-conformity of a web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten testing tools, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes several API endpoints for agents and several web UI URLs for humans to obtain information from Kilotest reports. To learn more about Kilotest and the advangages of testing with an ensemble of tools, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'requesting agent': {
        identifier: agentID,
        name: researchAgents[agentID]
      },
      'type of request': {
        identifier: 'reportIssues',
        description: 'What issues does the specified report describe?'
      },
      'closest ancestor request': {
        description: 'Which web pages are reports available about, and what are the statistics about the issues reported for each page?',
        URLs: {
          'for you': `${thisHost}/api/${agentID}/targets.html`,
          'for humans': `${thisHost}/targets.html`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
      'URL of the human-oriented equivalent of this response': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
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
    'tools that tried to test the page': getToolsFacts(Object.keys(tools)),
    'tools that were unable to test the page': preventedTools,
    'tools that reported issues': {
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
      .map(issue => getIssueFacts(thisHost, agentID, timeStamp, jobID, issue)),
      'high priority': issues[3]
      .map(issue => getIssueFacts(thisHost, agentID, timeStamp, jobID, issue)),
      'low priority': issues[2]
      .map(issue => getIssueFacts(thisHost, agentID, timeStamp, jobID, issue)),
      'lowest priority': issues[1]
      .map(issue => getIssueFacts(thisHost, agentID, timeStamp, jobID, issue))
    }
  };
  return response;
};
