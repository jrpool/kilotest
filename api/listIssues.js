/*
  listIssues.js
  Returns details about one report and basics about all the issues in it.
*/

// IMPORTS

const {
  getIssueSpec,
  getReportBasics,
  getResponseMetadata,
  getRuleEngineFacts,
  getRuleEnginesFacts,
  getToolsFacts,
  thisHost
} = require('./util');
const {getReport, getReportStats, objectSort} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [timeStamp = '', jobID = ''] = args;
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'details about the report': null,
    'how to request that the page be retested': null,
    'how a web user can request that the page be retested': null,
    'how to get the full report in JSON': null,
    'how a web user can get the full report in JSON': null,
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
    // Get the basics about the report (which may be only an error message).
    const reportBasics = await getReportBasics(timeStamp, jobID);
    // Add them to the response content.
    responseContent['basics about the report'] = reportBasics;
    // If the basics about the report were obtained:
    if (!reportBasics.error) {
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
            const {catalogIndex, issueID, outcome} = instance;
            // If the instance reports a violation:
            if (outcome !== 'cantTell') {
              // Get the specification of its issue.
              const issueSpec = issueID ? getIssueSpec(issueID) : null;
              // If the instance has a non-ignorable and fully classified issue:
              if (issueSpec) {
                const {summary, weight, why} = issueSpec;
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
      // Get the size of the report.
      const reportStats = await getReportStats(timeStamp, jobID);
      // If this succeeded:
      if (reportStats) {
        const {reportSize} = reportStats;
        // Add instructions for getting the full report to the response content.
        responseContent['how to get the full report in JSON'] = {
          'size of the report in bytes': reportSize,
          method: 'GET',
          URL: `${thisHost}/api/getReport/${timeStamp}/${jobID}`
        };
        // Add instructions for web users to get the full report to the response content.
        responseContent['how a web user can get the full report in JSON'] = {
          URL: `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
        };
      }
      // Add the details about the job and test results to the response content.
      responseContent['details about the report'] = {
        'job definition': jobDefinitionDetails,
        'test results': resultDetails
      };
      // If the report has been superseded:
      if (reportBasics['whether a later report about the same page exists']) {
        // Add information about requesting a retest to the response content.
        responseContent['how to request that the page be retested'] = {
          notice: 'A later report about the same page already exists. The listIssues output about that report includes instructions for requesting a retest.'
        };
      }
      // Otherwise, i.e. if the report has not been superseded:
      else {
        // Add instructions for a retest request to the response content.
        responseContent['how to request that the page be retested'] = {
          method: 'POST',
          URL: `${thisHost}/api/requestRetest/${timeStamp}/${jobID}`,
          'request body': {
            reason: '20- to 100-character reason why the page should be retested'
          },
          'how to check whether the request has been fulfilled':
          'use the listReports tool to determine whether a report about the page has become available (typical wait time: 1 hour to 1 day)'
        };
        // Add instructions for a web user to request a retest.
        responseContent['how a web user can request that the page be retested'] = {
          URL: `${thisHost}/requestRetestForm.html/${timeStamp}/${jobID}`
        };
      }
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
          'how to get details about the issue': {
            method: 'GET',
            URL: `${thisHost}/api/listViolators/${id}/${timeStamp}/${jobID}`
          },
          'web users can get details about the issue at': `${thisHost}/listViolators.html/${id}/${timeStamp}/${jobID}`
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
      URL: `${thisHost}/api/listIssues/${timeStamp}/${jobID}`,
      'closest ancestor request': {
        'tool name': 'listReports',
        description: 'Provide basics about all available reports.',
        method: 'GET',
        URL: `${thisHost}/api/listReports`,
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listIssues.html/${timeStamp}/${jobID}`,
      'closest ancestor request': `${thisHost}/listReports.html`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
