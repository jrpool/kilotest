/*
  listDiagnoses.js
  Lists all diagnoses of one violation of one issue in one Kilotest report.
*/

// IMPORTS

const {getData} = require('../reportIssues/util');
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

// Gets facts about an issue in a report.
const getIssueFacts = async (issue, timeStamp, jobID) => {
  const {issueID, reporterCount, reporters, summary, violatorCount, wcag, why} = issue;
  const wcagType = wcag.length === 3 ? 'guideline' : 'success criterion';
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const {acts, catalog, error} = report;
  // If this failed:
  if (error) {
    // Return why.
    return {
      status: 'error',
      message: error
    };
  }
  // Initialize the issue violators.
  const violatorIndexSet = new Set();
  // For each act of the report:
  acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        const {catalogIndex} = instance;
        // If its issue is the issue to be described and the instance has a catalog index:
        if (instance.issueID === issueID && catalogIndex) {
          // Ensure that the violator is among the issue violators.
          violatorIndexSet.add(catalogIndex);
        }
      });
    }
  });
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
    'HTML elements reported as exhibiting the issue': Array
    .from(violatorIndexSet)
    .filter(index => catalog[index])
    .map(index => ({
      identifier: String(index),
      'tag name': catalog[index].tagName,
      'id attribute': catalog[index].id,
      'start tag': catalog[index].startTag,
      'inner text': catalog[index].text,
      'inner text usable as a text fragment for linking': catalog[index].textLinkable,
      'x, y, width, height in pixels': catalog[index].boxID.split(':'),
      'XPath': catalog[index].pathID
    }))
  };
};
// Returns a response to a report-issue request.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    // Return this.
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  // Otherwise, i.e. if the report is available, get data on the report and its issues.
  const data = await getData(timeStamp, jobID);
  const {error, issuesData, pageData} = data;
  // If this failed:
  if (error) {
    // Return why.
    return {
      status: 'error',
      message: error
    };
  }
  const {what, url, daysAgo} = pageData;
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
