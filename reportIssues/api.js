/*
  api.js
  Responds to the report-issues request.
*/

// IMPORTS

const {getData, getToolData} = require('./util');
const {
  getDateTime,
  getNowStamp,
  getRandomString,
  isHidden,
  tools
} = require('../util');

// FUNCTIONS

// Gets facts about tools.
const getToolFacts = toolIDs => {
  const crypticData = getToolData(toolIDs);
  return crypticData.map(tool => {
    const {toolID, toolName, toolMaker} = tool;
    return {
      identifier: toolID,
      name: toolName,
      sponsor: toolMaker
    };
  });
};
// Gets facts about an issue.
const getIssueFacts = issue => {
  const {issueID, reporterCount, reporterList, reporters, summary, violatorCount, wcag, why} = issue;
  return {
    identifier: issueID,
    summary,
    'related WCAG principle (n.n) or success criterion (n.n.n)': wcag,
    'impact on a user': why,
    'tools reporting the issue': {
      'number': reporterCount,
      'names': reporters.map(tool => tool.toolName)
    },
    'number of HTML elements reported as exhibiting the issue': violatorCount
  };
};
// Returns a response to a target-issues request.
exports.response = async args => {
  const [agentName, timeStamp, jobID] = args;
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
    identifier: prevention[0],
    name: tools[prevention[0]][0],
    'reason for failure': prevention[1]
  }));
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const response = {
    summary: `This document fulfills a request made by an agent to Kilotest. The agent requested data about the accessibility, usability, and standard-conformity of a web page. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten testing tools, had performed tests on that web page, using a combination of rule- and machine-learning-based methods, and produced a report. Several API endpoints for agents and several web UI URLs for humans provide information from the report. More detailed information about the software behind the report is available from the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), which contains an introduction on its home page and a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'name of the requesting agent': agentName,
      'type of request': {
        identifier: 'reportIssues',
        description: 'What issues does the specified report describe?'
      },
      'closest ancestor request': {
        'information that it requests': 'Which web pages are reports available about and, briefly, what was found about them?',
        'URL for agents': `${thisHost}/api/targets.html`,
        'URL for humans': `${thisHost}/targets.html`
      }
    },
    'response metadata': {
      'date and time': new Date().toISOString(),
      'identifier': `${getNowStamp()}-${getRandomString(3)}`,
      'URL of the human-oriented equivalent': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
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
    'names of tools that tried to test the page': getToolFacts(Object.keys(tools)),
    'tools that were unable to test the page': preventedTools,
    'tools that reported issues': {
      'number': reporterCount,
      'names': reporters.map(tool => tool.toolName)
    },
    'number of issues reported': {
      'total': issueCount,
      'by priority': {
        'highest priority': issues[4].length,
        'high priority': issues[3].length,
        'low priority': issues[2].length,
        'lowest priority': issues[1].length
      }
    },
    'number of HTML elements reported as exhibiting issues': violatorCount,
    'issues reported': {
      'highest priority': issues[4].map(issue => getIssueFacts(issue)),
      'high priority': issues[3].map(issue => getIssueFacts(issue)),
      'low priority': issues[2].map(issue => getIssueFacts(issue)),
      'lowest priority': issues[1].map(issue => getIssueFacts(issue))
    }
  };
  return response;
};
