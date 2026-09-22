/*
  requestFeature.ts
  Processes a request to add or improve a feature and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {sendAlert} from '../alerts.ts';
import {checkCommentDuplicate, checkLength, describeMax, getEnvMax, getJSON, getNowStamp} from '../util.ts';
import {requestFeatureResponseSchema} from './schemas.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestFeatureResponseSchema>['response content'];

// FUNCTIONS (helpers)

const getFeatureRequestsPath = () => process.env.FEATURE_REQUESTS_PATH || path.join(import.meta.dirname, '../db/featureRequests.json');
// Maximum number of feature requests held at once. Once reached, a new, distinct request
// is rejected rather than stored, so the feature-requests file and the manager alert
// emails it generates cannot grow without bound (modeled on a full mailbox rejecting new
// mail; see GitHub issue #3, abuse type 3). Configurable via FEATURE_REQUESTS_MAX, since
// different Kilotest deployments' maintainers may want a different size; a value of 0
// means no limit.
const getFeatureRequestsMax = () => getEnvMax('FEATURE_REQUESTS_MAX', 20);

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [feature = ''] = args;
  const thisHost = getThisHost();
  const lengthCheck = checkLength(feature, 20, 1000, 'feature description');
  // Initialize the response content.
  let responseContent: ResponseContent;
  // If the feature description is invalid:
  if (lengthCheck.status === 'error') {
    responseContent = {
      'details about your request': {
        error: `request invalid: ${lengthCheck.message}`
      }
    };
  }
  // Otherwise, i.e. if it is valid:
  else {
    // Get the feature requests already on file.
    const featureRequestsPath = getFeatureRequestsPath();
    let featureRequests: {timeStamp: string; content: string}[] = [];
    try {
      const existing = await fs.readFile(featureRequestsPath, 'utf8');
      featureRequests = JSON.parse(existing);
    }
    catch {
      // Initialize an empty feature-requests array.
    }
    // If the request is identical to one already on file:
    const duplicateCheck = checkCommentDuplicate(featureRequests, feature);
    if (duplicateCheck.status === 'error') {
      responseContent = {
        'details about your request': {
          error: 'request invalid: your feature request is identical to one already submitted, ' +
            'but you are welcome to submit a different one'
        }
      };
    }
    // Otherwise, if the feature requests already on file have reached the cap (a cap of 0
    // means no limit, so the queue is never full):
    else if (getFeatureRequestsMax() > 0 && featureRequests.length >= getFeatureRequestsMax()) {
      responseContent = {
        'details about your request': {
          error: 'request invalid: too many feature requests are awaiting review right now. ' +
            'Please try again later, or post your request at https://github.com/jrpool/kilotest/issues ' +
            'or email info@kilotest.com.'
        }
      };
    }
    // Otherwise, i.e. if it is not a duplicate and the queue is not full:
    else {
      // Record the feature request alongside the existing ones.
      featureRequests.push({
        timeStamp: getNowStamp(),
        content: feature
      });
      await fs.mkdir(path.dirname(featureRequestsPath), {recursive: true});
      await fs.writeFile(featureRequestsPath, getJSON(featureRequests));
      // Notify the manager, including the resulting count, so a maintainer who has been
      // away sees at a glance how urgently the requests need review.
      await sendAlert(
        'Kilotest: MCP feature request received',
        `${feature}\nFeature requests now awaiting review: ${featureRequests.length} of ${describeMax(getFeatureRequestsMax())}`
      );
      // Add the disposition to the response content.
      responseContent = {
        'details about your request': {
          'date and time received': new Date().toISOString(),
          disposition: 'received and logged; manager notified'
        }
      };
    }
  }
  // Create a response body.
  const body = {
    'tool collection': getToolsFacts(),
    'tool name': 'requestFeature',
    'this request': {
      description: 'Process my request to add or improve a feature.',
      method: 'POST',
      URL: `${thisHost}/api/requestFeature`,
      body: {
        feature
      },
      'closest ancestor request': null
    },
    'URLs of similar requests for web users': null,
    'response metadata': getResponseMetadata(),
    'response content': responseContent
  };
  // Return it.
  return body;
};
