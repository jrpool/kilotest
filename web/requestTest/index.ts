/*
  index.ts
  Records a test request.
*/

// IMPORTS

import {populateTemplate, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (description: string, url: string, reason: string) => {
  // Process the request.
  const result = await processTestRequest('test', description, url, reason);
  // If the request was recorded:
  if (result === 'ok') {
    const query = {
      description,
      url,
      reason
    };
    // Return the populated page.
    return {
      status: 'ok',
      answerPage: await populateTemplate(import.meta.dirname, query)
    };
  }
  // Otherwise, if the request is a duplicate:
  else if (result === 'duplicate') {
    // Report this.
    return {
      status: 'error',
      message: 'Test request duplicates an already submitted request'
    };
  }
  // Otherwise, if a report is available about a page with the same description and URL:
  else if (result === 'retest') {
    // Report this.
    return {
      status: 'error',
      message: 'A report about the page is already available'
    }
  }
  // Otherwise, i.e. if a request to test a page with the same description or URL is approved:
  else {
    // Report this.
    return {
      status: 'error',
      message: 'A request to test a page with the same description or URL is already approved'
    }
  }
};
