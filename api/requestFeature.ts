/*
  requestFeature.ts
  Processes a request to add or improve a feature and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {sendAlert} from '../alerts.ts';
import {checkCommentDuplicate, checkLength, getJSON, getNowStamp} from '../util.ts';
import {requestFeatureResponseSchema} from './schemas.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestFeatureResponseSchema>['response content'];

// FUNCTIONS (helpers)

const getFeatureRequestsPath = () => process.env.FEATURE_REQUESTS_PATH || path.join(import.meta.dirname, '../db/featureRequests.json');

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
    // Otherwise, i.e. if it is not a duplicate:
    else {
      // Record the feature request alongside the existing ones.
      featureRequests.push({
        timeStamp: getNowStamp(),
        content: feature
      });
      await fs.mkdir(path.dirname(featureRequestsPath), {recursive: true});
      await fs.writeFile(featureRequestsPath, getJSON(featureRequests));
      // Notify the manager.
      await sendAlert('Kilotest: MCP feature request received', feature);
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
