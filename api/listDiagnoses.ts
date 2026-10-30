/*
  listDiagnoses.ts
  Returns details about one violator of one issue in one report and facts about all its diagnoses.
*/

// IMPORTS

import {z} from 'zod';
import {
  getIssueSpec,
  getReportBasics,
  getResponseMetadata,
  getToolsFacts,
  getThisHost
} from './util.ts';
import {getReport, getTestActInstances, isReportError} from '../util.ts';
import {listDiagnosesResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof listDiagnosesResponseSchema>['response content'];
// The array variant of the union allowed for the diagnoses property.
type Diagnoses = Extract<ResponseContent['diagnoses of how the element exhibited the issue'], unknown[]>;

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [catalogIndex = '', issueID = '', reportID = ''] = args;
  const thisHost = getThisHost();
  // Get the report.
  const report = await getReport(reportID);
  // Get the specification of the issue.
  const issueSpec = issueID ? getIssueSpec(issueID) : null;
  // Initialize the response content.
  const responseContent: ResponseContent = {
    'basics about the report': isReportError(report) ? report : await getReportBasics(reportID),
    'basics about the issue': {
      'error': 'No information about the specified issue is available'
    },
    'basics about the element': null,
    'details about the element': null,
    'diagnoses of how the element exhibited the issue': issueSpec ? null : {
      'error': 'No diagnoses of how the element exhibited the issue is available'
    }
  };
  // If the issue is non-ignorable and fully classified:
  if (issueSpec) {
    const {summary, wcag, weight, why} = issueSpec;
    // Add the basics about it to the response content.
    responseContent['basics about the issue'] = {
      'identifier': issueID,
      summary,
      'impact on a user': why,
      'related WCAG standard': {
        'layer': (wcag.length > 4 ? 'success criterion' : 'guideline') as 'success criterion' | 'guideline',
        'identifier': wcag
      },
      priority: ['lowest', 'low', 'high', 'highest'][weight - 1] as 'lowest' | 'low' | 'high' | 'highest'
    };
  }
  // If the report was retrieved successfully:
  if (!isReportError(report)) {
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
        const diagnoses: Diagnoses = [];
        // For each instance reporting a violation of the issue by the violator:
        getTestActInstances(report, {violationsOnly: true, issueID, catalogIndex})
        .forEach(({act, instance}) => {
          const {count, ordinalSeverity, ruleID, what} = instance;
          // Get the diagnosis.
          const diagnosis: Diagnoses[number] = {
            'identifier of the rule engine': act.which!,
            'identifier of the violated rule': ruleID !== what ? ruleID : null,
            'description of the violation': what,
            'severity of the violation on a 0-to-3 scale': ordinalSeverity,
            'count of violations of the rule by the element': count ?? 1,
            'how to report that you disagree with this diagnosis': {
              method: 'POST',
              URL: `${thisHost}/api/reportDisagreement/${issueID}/${reportID}/${catalogIndex}`,
              'request body': {
                engineID: 'the identifier of the rule engine shown in this diagnosis',
                ruleID: 'the identifier of the violated rule shown in this diagnosis, or, if it is null, the description of the violation',
                reason: '20- to 1000-character explanation of why you disagree with this diagnosis'
              }
            }
          }
          diagnoses.push(diagnosis);
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
      description: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue. The catalogIndex, issueID, and reportID parameters identify the element, issue, and report that I want details about. Those parameters were in the response to my earlier listViolators request.',
      method: 'GET',
      URL: `${thisHost}/api/listDiagnoses/${catalogIndex}/${issueID}/${reportID}`,
      'closest ancestor request': {
        'tool name': 'listViolators',
        description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.',
        method: 'GET',
        URL: `${thisHost}/api/listViolators/${issueID}/${reportID}`
      }
    },
    'URLs of similar requests for web users': {
      'this request': `${thisHost}/listDiagnoses.html/${issueID}/${reportID}/${catalogIndex}`,
      'closest ancestor request': `${thisHost}/listViolators.html/${issueID}/${reportID}`
    },
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  }
  // Return it.
  return body;
};
