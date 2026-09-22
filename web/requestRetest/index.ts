/*
  index.ts
  Records a retest request.
*/

// IMPORTS

import {populateTemplate, processTestRequest} from '../../util.ts';

// FUNCTIONS

export const answer = async (pageArgs: string, reason: string) => {
  const [timeStamp, jobID] = pageArgs.split('/') as [string, string];
  // Process the request. This resolves the cited report's description and URL itself.
  const processResult = await processTestRequest(reason, {timeStamp, jobID});
  // If the cited report does not exist:
  if (processResult.result === 'nonreport') {
    // Report this.
    return {
      status: 'error',
      message: 'Invalid request'
    };
  }
  const {result, description, url} = processResult;
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
  // Otherwise, if the cited report has been superseded:
  else if (result === 'superseded') {
    // Report this.
    return {
      status: 'error',
      message: 'A later report about the page is already available'
    }
  }
  // Otherwise, if the queue of requests awaiting approval is full:
  else if (result === 'queueFull') {
    // Report this, with a fallback channel, since this request cannot be queued here.
    return {
      status: 'error',
      message: 'Too many requests are awaiting approval right now. Please try again later, ' +
        'or post your request at https://github.com/jrpool/kilotest/issues or email info@kilotest.com.'
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
