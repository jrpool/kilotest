/*
  index.ts
  Records a request for a test of a page of a new site.
*/

// IMPORTS

import {checkLength, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {describeRefusal, nameBounds, normalizeSpace, submitTestRequest} from '../../requests.ts';
import type {SubmitResult} from '../../requests.ts';

// FUNCTIONS

export const answer = async (rawSiteName: string, rawPageName: string, url: string, reason: string) => {
  const siteName = normalizeSpace(rawSiteName);
  const pageName = normalizeSpace(rawPageName);
  const nameCheck = [
    checkLength(siteName, nameBounds.site.min, nameBounds.site.max, 'site name'),
    checkLength(pageName, nameBounds.page.min, nameBounds.page.max, 'page name')
  ].find(check => check.status === 'error');
  // If a name is too short or too long:
  if (nameCheck?.status === 'error') {
    return {status: 'error', message: nameCheck.message};
  }
  // Submit the request for management review.
  const result = await submitTestRequest({
    target: {siteName, pageName, url}, reason, reviewImmediately: false
  }) as Exclude<SubmitResult, {result: 'nonreport'}>;
  // If the request was recorded:
  if (result.result === 'pending') {
    const query = {
      description: `${result.page.siteName} ${result.page.pageName}`,
      url,
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
