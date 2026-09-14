/*
  index.ts
  Records a test request.
*/

// IMPORTS

import {getRequestability, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (description: string, url: string, why: string) => {
  const status = await getRequestability(url);
  // If the target is already claimed or queued and is thus not requestable:
  if (status) {
    // Return an answer reporting this.
    return {
      status: 'error',
      message: `Page is already ${status}`
    };
  }
  // Otherwise, i.e. if it is requestable, process the request.
  return await processTestRequest('test', import.meta.dirname, description, url, why);
};
