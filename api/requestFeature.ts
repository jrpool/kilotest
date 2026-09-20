/*
  requestFeature.ts
  Processes a request to add or improve a feature and returns an acknowledgement.
*/

// IMPORTS

import {z} from 'zod';
import {getResponseMetadata, getThisHost, getToolsFacts} from './util.ts';
import {sendAlert} from '../alerts.ts';
import {requestFeatureResponseSchema} from './schemas.ts';

// TYPES

// The response content defined by the response schema.
type ResponseContent = z.infer<typeof requestFeatureResponseSchema>['response content'];

// FUNCTIONS

// Returns the response body.
export const response = async (args: string[]) => {
  const [feature = ''] = args;
  const thisHost = getThisHost();
  // Initialize the response content.
  const responseContent: ResponseContent = {
    'details about your request': {
      error: 'request invalid: request is empty'
    }
  };
  // If the requested feature or improvement exists:
  if (feature) {
    // Notify the manager.
    await sendAlert('Kilotest: MCP feature request received', feature);
    // Add the disposition to the response content.
    responseContent['details about your request'] = {
      'date and time received': new Date().toISOString(),
      disposition: 'received and logged; manager notified'
    };
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
