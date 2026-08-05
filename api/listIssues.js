/*
  listIssues.js
  Returns details about one report and basics about all the issues in it.
*/

// IMPORTS

const {
  getIssueClassification,
  getReportBasics,
  getResponseMetadata,
  getRuleEngineFacts,
  getRuleEnginesFacts,
  getToolsFacts,
  thisHost
} = require('./util');
const {getReport, objectSort} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp, jobID] = args;
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'details about the report': null,
    'basics about all issues reported in the report': null
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
    // If this succeeded, the log file is valid, and the report is not hidden:
    if (! reportBasics.error) {
      // Delete the URLs for more details from the basics about the report.
      delete reportBasics['URLs for more details'];
      // Add the basics about the report to the response content.
      responseContent['basics about the report'] = reportBasics;
      const {
        strict = null,
        standard = null,
        device = {id: 'default'},
        browserID = null
      } = report;
      // Get details about the job definition.
      const jobDefinitionDetails = {
        'whether the job prohibited redirection': strict,
        'whether the native results of rule engines are reported': ['also', 'no'].includes(standard),
        'whether standardized results are reported': ['also', 'only'].includes(standard),
        'device emulated by the job': device,
        'browser type used by the job': browserID
      };
      // Initialize data about the test results.
      const ruleEngineIDs = new Set();
      const reporterIDs = new Set();
      const violatorIndexes = new Set();
      const issuesData = {};
      // For each act in the report:
      report.acts.forEach(act => {
        const {result, type, which} = act;
        // If the act is a test act with a specified rule engine:
        if (type === 'test' && which) {
          // Ensure its rule engine is in the results data.
          ruleEngineIDs.add(which);
          const instances = result?.standardResult?.instances ?? [];
          // For each standard instance of the act:
          instances.forEach(instance => {
            const {catalogIndex, issueID} = instance;
            // Get the classification of its issue.
            const issueClassification = issueID ? getIssueClassification(issueID) : null;
            // If the instance has a non-ignorable and fully classified issue:
            if (issueClassification) {
              const {summary, weight, why} = issueClassification;
              // Ensure the rule-engine ID is in the reporters data.
              reporterIDs.add(which);
              // If the instance has a catalog index:
              if (catalogIndex) {
                // Ensure the index of the violator is in the results data.
                violatorIndexes.add(catalogIndex);
              }
              // Ensure the data about the issue are in the results data.
              issuesData[issueID] ??= {
                id: issueID,
                summary,
                weight,
                why,
                reporterIDs: new Set()
              };
              // Ensure the reporter ID is in the data about the issue.
              issuesData[issueID].reporterIDs.add(which);
            }
          });
        }
      });
      const {preventions} = report.jobData;
      // Get the details about the rule engines that could not test the page.
      const preventionFacts = Object.entries(preventions ?? {}).map(([ruleEngineID, reason]) => ({
        'name': getRuleEngineFacts(ruleEngineID).name,
        'reason for failure': reason
      }));
      const sortedPreventionFacts = objectSort(preventionFacts ?? [], 'name', 'alpha');
      // Initialize the counts of issues by weight.
      const weightCounts = [0, 0, 0, 0];
      // For each issue:
      Object.values(issuesData).forEach(issueData => {
        // Increment the count of issues with its weight.
        weightCounts[issueData.weight - 1]++;
      });
      // Get details about the test results.
      const resultDetails = {
        'rule engines that tried to test the page': getRuleEnginesFacts(ruleEngineIDs),
        'rule engines that could not test the page': sortedPreventionFacts,
        'names of rule engines that reported rule violations': getRuleEnginesFacts(reporterIDs)
        .map(facts => facts.name),
        'counts of issues by priority': {
          'highest': weightCounts[3],
          'high': weightCounts[2],
          'low': weightCounts[1],
          'lowest': weightCounts[0]
        },
        'number of elements reported as violators': violatorIndexes.size
      };
      // Add the details about the job and results to the response content.
      responseContent['details about the report'] = {
        'job definition': jobDefinitionDetails,
        'test results': resultDetails
      };
      // Sort the data about issues by summary.
      const sortedIssuesData = objectSort(Object.values(issuesData), 'summary', 'alpha');
      // Get the basics about the issues.
      const issuesBasics = sortedIssuesData.map(issueData => {
        const {id, summary, weight, why, reporterIDs} = issueData;
        return {
          identifier: id,
          summary,
          priority: ['lowest', 'low', 'high', 'highest'][weight - 1],
          'impact on a user': why,
          'rule engines with any violations belonging to the issue': getRuleEnginesFacts(reporterIDs)
          .map(ruleEnginesFact => ruleEnginesFact.name),
          'URLs for more details': {
            'for JSON output': `${thisHost}/api/listViolators/${id}/${timeStamp}/${jobID}`,
            'for HTML output': `${thisHost}/reportIssue.html/${id}/${timeStamp}/${jobID}`
          }
        };
      });
      // Add the basics about the issues to the response content.
      responseContent['basics about all issues reported in the report'] = issuesBasics;
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listIssues',
    'this request': {
      description: 'Provide details about one report, including basics about the issues reported in it. The timeStamp and jobID parameters identify the report that I want details about. Those parameters were in the response to my earlier listReports request.',
      method: 'GET',
      URLs: {
        'of this request': `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
        'of the equivalent request for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        'tool name': 'listReports',
        description: 'Provide basics about all available reports.',
        URLs: {
          'for JSON output': `${thisHost}/api/listReports`,
          'for HTML output': `${thisHost}/targets.html`
        }
      }
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
