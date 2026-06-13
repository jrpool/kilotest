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
  getToolData,
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
exports.response = async pageArgs => {
  const [timeStamp, jobID] = pageArgs;
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
  const {issueCount, issues, preventions, priorityNames, reporters, violatorCount} = issuesData;
  const preventedTools = getToolFacts(Object.keys(preventions));
  preventedTools.forEach(preventedTool => {
    preventedTool['reason for failure'] = preventions[preventedTool.identifier];
  });
  // Get a response.
  const response = {
    'tool name': 'Kilotest',
    request: {
      requester: {
        identifier: 'placeholder for requester identifier',
        name: 'placeholder for requester name'
      },
      'date and time': 'placeholder for request date and time',
      type: {
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
      'URL for human inspection': `https://kilotest.com/reportIssues.html/${timeStamp}/${jobID}`
    },
    'tested web page': {
      description: what,
      URL: url
    },
    'tools that tried to test the page': getToolNamesString(Object.keys(tools)),
    'tools that were unable to test the page': preventedTools,
    'tools that reported issues': getToolFacts(reporters.map(tool => tool.toolID)),
    'number of issues reported': issueCount,
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
