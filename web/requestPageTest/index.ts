/*
  index.ts
  Records a request for a test of a page of a tested site.
*/

// IMPORTS

import {checkLength, htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {describeRefusal, nameBounds, normalizeSpace, submitTestRequest} from '../../requests.ts';
import type {SubmitResult} from '../../requests.ts';

// FUNCTIONS

export const answer = async (siteID: string, rawPageName: string, url: string, reason: string) => {
  const pageName = normalizeSpace(rawPageName);
  const nameCheck = checkLength(pageName, nameBounds.page.min, nameBounds.page.max, 'page name');
  // If the page name is too short or too long:
  if (nameCheck.status === 'error') {
    return {status: 'error', message: nameCheck.message};
  }
  // Submit the request for management review.
  const result = await submitTestRequest({
    target: {siteID, pageName, url}, reason, reviewImmediately: false
  }) as Exclude<SubmitResult, {result: 'nonreport' | 'ordered'}>;
  // If the request was recorded:
  if (result.result === 'pending') {
    const query = {
      siteID,
      description: htmlSafe(`${result.page.siteName} ${result.page.pageName}`),
      url: htmlSafe(url),
      reason: htmlSafe(reason)
    };
    // Return the populated page.
    return {
      status: 'ok',
      answerPage: await populateTemplate(import.meta.dirname, query)
    };
  }
  // Otherwise, i.e. if the request was refused, report why.
  return {
    status: 'error',
    message: `Your request will not be processed, because ${describeRefusal(result, await getRegistry())}`
  };
};
