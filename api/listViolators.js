/*
  listViolators.js
  Returns details about one issue in one report and basics about all its violators.
*/

// IMPORTS

const {getReportBasics, getResponseMetadata, getToolsFacts} = require('./util');
const {getReport, ruleEngines} = require('../util');
const issuesClassification = require('testilo/procs/score/tic').issues;

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
  // Get facts about the tool collection.
  const toolsFacts = getToolsFacts();
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'details about the issue': null,
    'rule engines reporting violations belonging to the issue': null,
    'basics about the violators of rules belonging to the issue': null
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
    // Get the issue classification.
    const issueClassification = issuesClassification[issueID];
    const {summary, wcag, weight, why} = issueClassification;
    // If the issue is non-ignorable and fully classified:
    if (
      issueID
      && issueID !== 'ignorable'
      && issueClassification
      && summary
      && [1, 2, 3, 4].includes(weight)
      && why
    ) {
      // Add the details about the issue to the response content.
      responseContent['details about the issue'] = {
        'identifier': issueID,
        summary,
        'impact on a user': why,
        'related WCAG standard': {
          'layer': (wcag?.length > 4 ? 'success criterion' : 'guideline') || null,
          'identifier': wcag || null
        },
        priority: ['lowest', 'low', 'high', 'highest'][weight - 1]
      };
      // Initialize data about the instances of the issue.
      const reporterIDs = new Set();
      const violatorIndexes = new Set();
      // For each act in the report:
      report.acts.forEach(act => {
        const {result, type, which} = act;
        // If the act is a test act with a specified rule engine:
        if (type === 'test' && which) {
          const instances = result?.standardResult?.instances ?? [];
          // For each of the standard instances of the act:
          instances.forEach(instance => {
            const {catalogIndex} = instance;
            // If the instance has the issue ID:
            if (instance.issueID === issueID) {
              // Ensure the rule-engine ID is in the data.
              reporterIDs.add(which);
              // If the instance has a catalog index:
              if (catalogIndex) {
                // Ensure the catalog index is in the data.
                violatorIndexes.add(catalogIndex);
              }
            }
          });
        }
      });
      // Add the details about the reporters of the issue to the response content.
      responseContent['rule engines reporting violations belonging to the issue'] = Array
      .from(reporterIDs)
      .map(reporterID => {
        const reporter = ruleEngines[reporterID];
        return {
          identifier: reporterID,
          name: reporter?.[0] || null,
          description: reporter?.[1] || null
        };
      });
      // Initialize the basics about the violators.
      const violatorsBasics = [];
      // Get the violator catalog indexes, sorted by DOM order.
      const sortedViolatorIndexes = Array
      .from(violatorIndexes)
      .sort((a, b) => Number(a) - Number(b));
      // For each violator index:
      sortedViolatorIndexes.forEach(violatorIndex => {
        const catalogItem = report.catalog[violatorIndex];
        // If it is the index of a catalog item:
        if (catalogItem) {
          const {tagName, text} = catalogItem;
          // Get the basics about it.
          const violatorBasics = {
            'index in the DOM': Number(violatorIndex),
            'tag name': tagName || null,
            'inner text': text || null,
          };
          // Add them to the basics about the violators.
          violatorsBasics.push(violatorBasics);
        }
      });
      // Add the basics about the violators to the response content.
      responseContent['basics about the violators of rules belonging to the issue']
      = violatorsBasics;
    }
  }
  // Create a response body.
  const body = {
    'tool collection': toolsFacts,
    'tool name': 'listViolators',
    request: {
      description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue. The issueID, timeStamp, and jobID parameters identify the issue and report that I want details about. Those parameters were in the response to my earlier listIssues request.',
      method: 'GET',
      URLs: {
        'for JSON output': `${thisHost}/api/listIssues/${issueID}/${timeStamp}/${jobID}`,
        'for HTML output': `${thisHost}/reportIssues.html/${issueID}/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        'tool name': 'listIssues',
        description: 'Provide details about one report, including basics about the issues reported in it. The timeStamp and jobID parameters identify the report that I want details about.',
        URLs: {
          'for JSON output': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
          'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
        }
      }
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  }
  // Return it.
  return body;
};
