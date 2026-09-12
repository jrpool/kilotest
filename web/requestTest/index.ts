/*
  index.ts
  Records a test request.
*/

// IMPORTS

import {isRecommendable, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (what: string, url: string, why: string) => {
  const status = await isRecommendable(url);
  // If the target is already claimed or queued and is thus not requestable:
  if (status) {
    // Return an answer reporting this.
    return {
      status: 'error',
      message: `Page is already ${status}`
    };
  }
  // Otherwise, i.e. if it is requestable, process the request.
  return await processTestRequest('test', import.meta.dirname, what, url, why);
};
