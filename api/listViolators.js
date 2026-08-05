/*
  listViolators.js
  Returns details about one issue in one report and basics about all the violators of the issue.
*/

// IMPORTS

const {
  getIssueClassification,
  getReportBasics,
  getResponseMetadata,
  getRuleEnginesFacts,
  getToolsFacts
} = require('./util');
const {getReport} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [issueID, timeStamp, jobID] = args;
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'basics about the issue': null,
    'details about the issue': null,
    'basics about all elements exhibiting the issue': null
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
    // Get the basics about the report.
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // If this failed, the log file is invalid, or the report is hidden:
    if (reportBasics.error) {
      // Add this to the response content.
      responseContent['basics about the report'] = reportBasics;
    }
    // Otherwise, i.e. if it succeeded, the log file is valid, and the report is not hidden:
    else {
      // Delete the URLs for more details from the basics about the report.
      delete reportBasics['URLs for more details'];
      // Add them to the response content.
      responseContent['basics about the report'] = reportBasics;
    }
  }
  // Get the classification of the issue.
  const issueClassification = issueID ? getIssueClassification(issueID) : null;
  // If the issue is ignorable or not fully classified:
  if (! issueClassification) {
    // Add this to the response content.
    responseContent['basics about the issue'] = {
      'error': 'No information about the specified issue is available'
    };
  }
  // Otherwise, i.e. if it is non-ignorable and fully classified:
  else {
    const {summary, wcag, weight, why} = issueClassification;
    // Initialize the basics and details about it.
    const issueBasics = {
      'identifier': issueID,
      summary,
      'impact on a user': why,
      'related WCAG standard': {
        'layer': (wcag.length > 4 ? 'success criterion' : 'guideline'),
        'identifier': wcag
      },
      priority: ['lowest', 'low', 'high', 'highest'][weight - 1]
    };
    // Add the basics about the issue to the response content.
    responseContent['basics about the issue'] = issueBasics;
    // If the report exists and is not hidden and its log file is valid:
    if (! report.error) {
      // Initialize data about the instances of the issue.
      const reporterIDs = new Set();
      const violators = {};
      // For each act in the report:
      report.acts.forEach(act => {
        const {result, type, which} = act;
        const instances = result?.standardResult?.instances || [];
        // If the act is a test act with a specified rule engine:
        if (type === 'test' && which) {
          // For each standard instance of the act:
          instances.forEach(instance => {
            // If the instance has the issue ID:
            if (instance.issueID === issueID) {
              const {catalogIndex} = instance;
              // Ensure the rule-engine ID is in the reporters data.
              reporterIDs.add(which);
              // If the instance has a catalog index:
              if (catalogIndex) {
                // Ensure the catalog index is in the violators data.
                violators[catalogIndex] ??= {
                  catalogIndex,
                  reporters: new Set()
                };
                // Ensure the reporter ID is in the violator data.
                violators[catalogIndex].reporters.add(which);
              }
            }
          });
        }
      });
      // Get details about the reporters of the issue.
      const reportersFacts = getRuleEnginesFacts(reporterIDs);
      // Add them to the facts about the issue.
      const issueDetails = {
        'rule engines reporting violations belonging to the issue': reportersFacts
      };
      // Add the details about the issue to the response content.
      responseContent['details about the issue'] = issueDetails;
      const {catalog} = report;
      // Get a sorted array of data about the violators.
      const sortedViolatorData = Object.values(violators).sort(
        (a, b) => {
          if (b.reporters.size === a.reporters.size) {
            return Number(a.catalogIndex) - Number(b.catalogIndex);
          }
          return b.reporters.size - a.reporters.size;
        }
      );
      // Get basics about the violators.
      const violatorsBasics = sortedViolatorData
      .map(violator => {
        const {catalogIndex, reporters} = violator;
        const catalogItem = catalog[catalogIndex];
        return {
          identifier: catalogIndex,
          'tag name': catalogItem?.tagName || null,
          'inner text': catalogItem?.text ?? null,
          'count of rule engines reporting that the element exhibits the issue': reporters.size,
          'URLs for more details': {
            'for JSON output':
            `${thisHost}/api/listDiagnoses/${catalogIndex}/${issueID}/${timeStamp}/${jobID}`,
            'for HTML output':
            `${thisHost}/diagnoses.html/${issueID}/${timeStamp}/${jobID}/${catalogIndex}`
          }
        };
      });
      // Add basics about the violators to the response content.
      responseContent['basics about all elements exhibiting the issue'] = violatorsBasics;
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listViolators',
    'this request': {
      description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported to be exhibiting the issue. The issueID, timeStamp, and jobID parameters identify the issue and report that I want details about. Those parameters were in the response to my earlier listIssues request.',
      method: 'GET',
      URLs: {
        'of this request': `${thisHost}/api/listViolators/${issueID}/${timeStamp}/${jobID}`,
        'of the equivalent request for HTML output':
        `${thisHost}/reportIssue.html/${issueID}/${timeStamp}/${jobID}`
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
