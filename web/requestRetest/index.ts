/*
  index.ts
  Records a retest request.
*/

// IMPORTS

import {populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {describeRefusal, submitTestRequest} from '../../requests.ts';

// FUNCTIONS

export const answer = async (reportID: string, reason: string) => {
  // Submit the request for management review. Its page and URL are those of the cited report’s page in the registry.
  const result = await submitTestRequest({target: {reportID}, reason, reviewImmediately: false});
  // If the cited report or its page does not exist:
  if (!('page' in result)) {
    return {
      status: 'error',
      message: 'Invalid request'
    };
  }
  // If the request was recorded:
  if (result.result === 'pending') {
    const query = {
      description: `${result.page.siteName} ${result.page.pageName}`,
      url: result.page.url,
      reason
    };
    // Return the populated page.
    return {
      status: 'ok',
      answerPage: await populateTemplate(import.meta.dirname, query)
    };
  }
  // Otherwise, i.e. if the request was refused, report why.
  const why = describeRefusal(result as Exclude<typeof result, {result: 'ordered'}>, await getRegistry());
  return {
    status: 'error',
    message: `Your request will not be processed, because ${why}`
  };
};
