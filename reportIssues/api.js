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
  getToolNamesString,
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
    'related WCAG standard': wcag,
    'impact on a user': why,
    'tools reporting violations of rules belonging to the issue': {
      'number of the tools': reporterCount,
      'alphabetized list of names of the tools': reporterList,
      'facts about the tools alphabetized by name': getToolFacts(reporters.map(tool => tool.toolID))
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
  const preventedTools = getToolFacts(Object.keys(preventions));
  preventedTools.forEach(preventedTool => {
    preventedTool['reason for failure'] = preventions[preventedTool.identifier];
  });
  const thisHost = process.env.THIS_KILOTEST_HOST;
  // Get a response.
  const response = {
    summary: `This document fulfills a request made by an agent to Kilotest. The agent requested data from a report produced by Kilotest. The report contains results of tests performed on a web page by an ensemble of tools. The tools use a combination of rule-based and machine-learning-based methods to identify accessibility, usability, and standard-conformity issues. More detailed information about Kilotest is available from its deployed instance, ${process.env.DEPLOYED_KILOTEST_HOST}. which contains an introduction on its home page and a tutorial.`,
    'tool name': 'Kilotest',
    request: {
      'name of requesting agent': agentName,
      'type of request': {
        identifier: 'reportIssues',
        description: 'What issues did Kilotest report in the specified report?'
      }
    },
    'response metadata': {
      'date and time': new Date().toISOString(),
      'identifier': `${getNowStamp()}-${getRandomString(3)}`
    },
    report: {
      identifier: `${timeStamp}-${jobID}`,
      'creation date': getDateTime(timeStamp),
      'days since the creation date': daysAgo,
      'URL for human inspection': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
    },
    'tested web page': {
      description: what,
      URL: url
    },
    'names of tools that tried to test the page': getToolNamesString(Object.keys(tools)),
    'tools that were unable to test the page': preventedTools,
    'tools that reported issues': {
      'number of tools': reporterCount,
      'facts about the tools': getToolFacts(reporters.map(tool => tool.toolID))
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
