/*
  listDiagnoses.js
  Returns details about one violator of one issue in one report and facts about all its diagnoses.
*/

// IMPORTS

const {
  getIssueSpec,
  getReportBasics,
  getResponseMetadata,
  getToolsFacts,
  thisHost
} = require('./util');
const {getReport} = require('../util');

// FUNCTIONS

// Returns the response body.
exports.response = async args => {
  const [catalogIndex = '', issueID = '', timeStamp = '', jobID = ''] = args;
  // Initialize the response content.
  const responseContent = {
    'basics about the report': null,
    'basics about the issue': null,
    'basics about the element': null,
    'details about the element': null,
    'diagnoses of how the element exhibited the issue': null
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
  }
  // Get the specification of the issue.
  const issueSpec = issueID ? getIssueSpec(issueID) : null;
  // If the issue is ignorable or not fully classified:
  if (!issueSpec) {
    // Add this to the response content.
    responseContent['basics about the issue'] = {
      'error': 'No information about the specified issue is available'
    };
    responseContent['diagnoses of how the element exhibited the issue'] = {
      'error': 'No diagnoses of how the element exhibited the issue is available'
    };
  }
  // Otherwise, i.e. if it is non-ignorable and fully classified:
  else {
    const {summary, wcag, weight, why} = issueSpec;
    // Initialize the basics about it.
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
    // Add them to the response content.
    responseContent['basics about the issue'] = issueBasics;
  }
  // If the report and its catalog exist:
  if (report.catalog) {
    const catalogItem = report.catalog[catalogIndex];
    // If the violator is not in it:
    if (!catalogItem) {
      // Add this to the response content.
      responseContent['basics about the element'] = {
        'error': 'No information about the specified element is available'
      };
    }
    // Otherwise, i.e. if the violator is in the catalog:
    else {
      // Get basics about the violator.
      const violatorBasics = {
        identifier: catalogIndex,
        'tag name': catalogItem.tagName || null,
        'inner text': catalogItem.text ?? null
      };
      // Add them to the response content.
      responseContent['basics about the element'] = violatorBasics;
      // Get details about the violator.
      const violatorDetails = {
        'start tag': catalogItem.startTag ?? null,
        'XPath': catalogItem.pathID ?? null,
        'x, y, width, and height of bounding box': catalogItem.boxID ?? null
      };
      // Add them to the response content.
      responseContent['details about the element'] = violatorDetails;
      // If the issue is non-ignorable and fully classified:
      if (issueSpec) {
        // Initialize data about the diagnoses of the violation of the issue.
        const diagnoses = [];
        // For each act in the report:
        report.acts.forEach(act => {
          const {result, type, which} = act;
          const instances = result?.standardResult?.instances || [];
          // If the act is a test act with a specified rule engine:
          if (type === 'test' && which) {
            // For each standard instance of the act:
            instances.forEach(instance => {
              const {count, ordinalSeverity, ruleID, what} = instance;
              // If the instance has the issue ID and the catalog index of the violator:
              if (instance.issueID === issueID && instance.catalogIndex === catalogIndex) {
                // Get the diagnosis.
                const diagnosis = {
                  'identifier of the violated rule': ruleID !== what ? ruleID : null,
                  'description of the violation': what,
                  'severity of the violation on a 0-to-3 scale': ordinalSeverity,
                  'count of violations of the rule by the element': count ?? 1
                }
                diagnoses.push(diagnosis);
              }
            });
          }
        });
        // Add the diagnoses to the response content.
        responseContent['diagnoses of how the element exhibited the issue'] = diagnoses;
      }
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'listDiagnoses',
    'this request': {
      description: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue. The catalogIndex, issueID, timeStamp, and jobID parameters identify the element, issue, and report that I want details about. Those parameters were in the response to my earlier listViolators request.',
      method: 'GET',
      URL: `${thisHost}/api/listDiagnoses/${catalogIndex}/${issueID}/${timeStamp}/${jobID}`,
      'closest ancestor request': {
        'tool name': 'listViolators',
        description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.',
        method: 'GET',
        URL: `${thisHost}/api/listViolators/${issueID}/${timeStamp}/${jobID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listDiagnoses.html/${issueID}/${timeStamp}/${jobID}/${catalogIndex}`,
      'closest ancestor request': `${thisHost}/listViolators.html/${issueID}/${timeStamp}/${jobID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  }
  // Return it.
  return body;
};
