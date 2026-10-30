/*
  reportDisagreement.ts
  Processes a report that the requester disagrees with a diagnosis and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {sendAlert} from '../alerts.ts';
import {
  checkLength,
  describeMax,
  getEnvMax,
  getJSON,
  getNowStamp,
  getReport,
  getTestActInstances,
  isReportError
} from '../util.ts';
import {reportDisagreementResponseSchema} from './schemas.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof reportDisagreementResponseSchema>['response content'];

// A stored disagreement with a diagnosis.
type Disagreement = {
  timeStamp: string;
  issueID: string;
  reportID: string;
  catalogIndex: string;
  engineID: string;
  ruleID: string;
  reason: string;
};

// FUNCTIONS (helpers)

const getDisagreementsPath = () => process.env.DISAGREEMENTS_PATH || path.join(import.meta.dirname, '../db/disagreements.json');
// Maximum number of diagnosis disagreements held at once. Once reached, a new, distinct
// disagreement is rejected rather than stored, so the disagreements file and the manager
// alert emails it generates cannot grow without bound (modeled on the feature-request
// cap in requestFeature.ts). Configurable via DISAGREEMENTS_MAX; a value of 0 means no
// limit.
const getDisagreementsMax = () => getEnvMax('DISAGREEMENTS_MAX', 20);

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [issueID = '', reportID = '', catalogIndex = '', engineID = '', ruleID = '', reason = ''] = args;
  const thisHost = getThisHost();
  const reasonCheck = checkLength(reason, 20, 1000, 'reason');
  // Initialize the response content.
  let responseContent: ResponseContent;
  // If the reason is too short or too long:
  if (reasonCheck.status === 'error') {
    responseContent = {
      'details about your request': {
        error: `request invalid: your ${reasonCheck.message}`
      }
    };
  }
  // Otherwise, i.e. if it is valid:
  else {
    // Get the report.
    const report = await getReport(reportID);
    // If the report was not retrieved successfully:
    if (isReportError(report)) {
      responseContent = {
        'details about your request': {
          error: 'request invalid: the specified report does not exist or is not usable'
        }
      };
    }
    // Otherwise, if the element is not in the report's catalog:
    else if (!report.catalog[catalogIndex]) {
      responseContent = {
        'details about your request': {
          error: 'request invalid: the specified element is not in the report'
        }
      };
    }
    // Otherwise, i.e. if the report and element exist:
    else {
      // Get the reported diagnoses of the element for the issue matching the engine and
      // rule (a ruleID is only unique within a rule engine: axe and alfa, for example,
      // both report rules numbered like r11 for the same element and issue).
      const matches = getTestActInstances(report, {violationsOnly: true, issueID, catalogIndex})
      .filter(({act, instance}) => act.which === engineID && instance.ruleID === ruleID);
      // If no reported diagnosis matches:
      if (!matches.length) {
        responseContent = {
          'details about your request': {
            error: 'request invalid: no such diagnosis was reported for the specified element and issue'
          }
        };
      }
      // Otherwise, i.e. if the diagnosis exists:
      else {
        // Get the disagreements already on file.
        const disagreementsPath = getDisagreementsPath();
        let disagreements: Disagreement[] = [];
        try {
          const existing = await fs.readFile(disagreementsPath, 'utf8');
          disagreements = JSON.parse(existing);
        }
        catch {
          // Initialize an empty disagreements array.
        }
        // If the disagreement is identical to one already on file:
        if (disagreements.some(d =>
          d.issueID === issueID
          && d.reportID === reportID
          && d.catalogIndex === catalogIndex
          && d.engineID === engineID
          && d.ruleID === ruleID
          && d.reason === reason
        )) {
          responseContent = {
            'details about your request': {
              error: 'request invalid: your disagreement is identical to one already submitted, ' +
                'but you are welcome to submit a different one'
            }
          };
        }
        // Otherwise, if the disagreements already on file have reached the cap (a cap of 0
        // means no limit, so the queue is never full):
        else if (getDisagreementsMax() > 0 && disagreements.length >= getDisagreementsMax()) {
          responseContent = {
            'details about your request': {
              error: 'request invalid: too many disagreements are awaiting review right now. ' +
                'Please try again later, or post your report at https://github.com/jrpool/kilotest/issues ' +
                'or email info@kilotest.com.'
            }
          };
        }
        // Otherwise, i.e. if it is not a duplicate and the queue is not full:
        else {
          // Record the disagreement alongside the existing ones.
          disagreements.push({
            timeStamp: getNowStamp(),
            issueID,
            reportID,
            catalogIndex,
            engineID,
            ruleID,
            reason
          });
          await fs.mkdir(path.dirname(disagreementsPath), {recursive: true});
          await fs.writeFile(disagreementsPath, getJSON(disagreements));
          // Notify the manager, including the resulting count, so a maintainer who has been
          // away sees at a glance how urgently the disagreements need review. The ruleID is
          // truncated because some rule engines (nuVal, nuVnu) use entire validator messages
          // as rule identifiers, which can be arbitrarily long.
          await sendAlert(
            'Kilotest: diagnosis disagreement received',
            `Disputed diagnosis: ${engineID} rule ${ruleID.slice(0, 500)} classified as issue ${issueID} ` +
            `on element ${catalogIndex} of report ${reportID}\nReason: ${reason}\n` +
            `Disagreements now awaiting review: ${disagreements.length} of ${describeMax(getDisagreementsMax())}`
          );
          // Add the disposition to the response content.
          responseContent = {
            'details about your request': {
              'date and time received': new Date().toISOString(),
              'diagnosis you disagree with': {
                'issue identifier': issueID,
                'identifier of the rule engine': engineID,
                'identifier of the violated rule': ruleID
              },
              disposition: 'received and logged; manager notified'
            }
          };
        }
      }
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'reportDisagreement',
    'this request': {
      description: 'Process my report that I disagree with a diagnosis. The issueID, reportID, and catalogIndex parameters identify the issue, report, and element of the diagnosis. They were in the response to my earlier listDiagnoses request. The engineID and ruleID properties of the request body identify which diagnosis I disagree with, and the reason property explains why I disagree with it.',
      method: 'POST',
      URL: `${thisHost}/api/reportDisagreement/${issueID}/${reportID}/${catalogIndex}`,
      body: {
        engineID,
        ruleID,
        reason
      },
      'closest ancestor request': {
        'tool name': 'listDiagnoses',
        description: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.',
        method: 'GET',
        URL: `${thisHost}/api/listDiagnoses/${catalogIndex}/${issueID}/${reportID}`
      }
    },
    'URLs of similar requests for web users': null,
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
