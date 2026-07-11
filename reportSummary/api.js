/*
  api.js
  Responds to the reportSummary API request.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLogs,
  getNowStamp,
  getRandomString,
  getReportSize,
  getJob,
  isValidJob,
  getReport,
  isValidReport
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns facts about a report.
const getReportFacts = async (report) => {
  // Initialize the facts.
  const facts = {
    ruleEngineIDs: new Set(),
    reporterIDs: new Set(),
    issueIDs: new Set(),
    violators: new Set()
  };
  // For each act in the report:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      // Ensure its rule engine is in the facts.
      facts.ruleEngineIDs.add(which);
      const instances = result?.standardResult?.instances ?? [];
      // If it has any standard instances:
      if (instances.length) {
        // Ensure the reporter is in the facts.
        facts.reporterIDs.add(which);
      }
      // For each of its standard instances:
      instances.forEach(instance => {
        const {catalogIndex, issueID} = instance;
        // If the instance identifies a non-ignorable issue:
        if (issueID && issueID !== 'ignorable') {
          // Ensure the issue ID is in the facts.
          facts.issueIDs.add(issueID);
          // If the instance has a catalog index:
          if (catalogIndex) {
            // Ensure the violator is in the facts.
            facts.violators.add(catalogIndex);
          }
        }
      });
    }
  });
          // Get the issue classification.
          const issueClassification = issuesClassification[issueID];
          // If the issue has a current weighted classification:
          if (issueClassification && [1, 2, 3, 4].includes(issueClassification.weight)) {
            const {summary, wcag, weight, why} = issueClassification;
            // Initialize the temporary data on the issue if necessary.
            temp.issues[issueID] ??= {
              issueID,
              summary,
              wcag,
              why,
              weight,
              reporters: new Set(),
              reporterList: '',
              violators: new Set()
            };
            // Ensure the tool is in the temporary data.
            temp.issues[issueID].reporters.add(which);
            temp.reporters.add(which);
            // If the instance has a catalog index:
            if (catalogIndex) {
              // Ensure the violator is in the temporary data.
              temp.issues[issueID].violators.add(catalogIndex);
              temp.violators.add(catalogIndex);
            }
          }
        }
      });
    }
  });
    // Finish populating the final data.
    final.reporters = getToolsData(temp.reporters);
    final.reporterList = getToolList(temp.reporters);
    final.reporterCount = final.reporters.length;
    final.violatorCount = temp.violators.size;
    Object.values(temp.issues).forEach(issue => {
      const {issueID, summary, wcag, why, weight} = issue;
      const finalIssue = {
        issueID,
        summary,
        wcag,
        why,
        weight
      };
      finalIssue.reporters = getToolsData(issue.reporters);
      finalIssue.reporterList = getToolList(issue.reporters);
      finalIssue.reporterCount = finalIssue.reporters.length;
      finalIssue.violatorCount = issue.violators.size;
      final.issues[issue.weight].push(finalIssue);
    });
    final.issueCount = Object.keys(temp.issues).length;
    // For each weight:
    [4, 3, 2, 1].forEach(weight => {
      // Sort its issues in the final data alphabetically by reporter names.
      objectSort(final.issues[weight], 'reporterList', 'alpha');
      // Sort the issues again in descending reporter-count order, making this the primary order.
      objectSort(final.issues[weight], 'reporterCount', 'numericDown');
    });
    // Return the data.
    return final;
  }
  // Otherwise, i.e. if it is invalid, return this.
  return 'ERROR: Report missing or invalid.';
};
// Returns a response to an API request for a summary of one report.
exports.response = async (timeStamp, jobID) => {
  // Initialize an array of facts about reports.
  const reportsFacts = [];
  // Get the available logs, with added job names.
  const availableLogs = await getLogs();
  // For each log:
  for (const availableLog of availableLogs) {
    const {jobName} = availableLog;
    const [timeStamp, jobID] = jobName.split('-');
    const reportSize = await getReportSize(timeStamp, jobID);
    const {superseded, url, what} = availableLog;
    // Add facts about its report to the array.
    reportsFacts.push({
      identifier: jobName,
      'creation date and time': getDateTime(timeStamp),
      'days since the creation date': getAgoDays(timeStamp),
      'tested web page': {
        description: what,
        URL: url
      },
      'whether a later report about the same page exists': !! superseded,
      'URLs for incrementally getting facts from the report': {
        'for you': `${thisHost}/api/reportIssues/${timeStamp}/${jobID}`,
        'for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'size of the report in bytes': reportSize,
      'URL to get the entire report as machine-oriented JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
    });
  }
  // Create a response body.
  const content = {
    summary: 'This document fulfills a request made by a language model to a Kilotest tool. The model asked for a summary of one Kilotest report. The model had previously used the getlistOfAllAvailableReports tool and already had basic facts about the report provided by that tool. This summary does not repeat those facts.',
    'tool collection name': 'Kilotest',
    'tool name': 'getSummaryOfOneReport',
    request: {
      'type of request': {
        identifier: 'reportSummary',
        description: 'Get a summary of one report. The summary describes the rule engines that tested the page and the issues that were revealed by the reported rule violations.'
      },
      method: 'GET',
      URLs: {
        'URL of your request': `${thisHost}/api/reportSummary/${timeStamp}/${jobID}`,
        'equivalent URL for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
      },
      'closest ancestor request': {
        'type of request': {
          identifier: 'reportList',
          description: 'Get a list of all available reports.'
        },
        method: 'GET',
        URLs: {
          'URL of your request': `${thisHost}/api/reportList`,
          'equivalent URL for humans': `${thisHost}/targets.html`
        }
      }
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'available reports': reportsFacts
  };
  // Return it.
  return content;
};
