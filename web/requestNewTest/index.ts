/*
  index.ts
  Records a request for a test of a page not yet tested, of either an existing site (identified) or a new site (named).
*/

// IMPORTS

import {checkLength, htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {describeRefusal, nameBounds, normalizeSpace, submitTestRequest} from '../../requests.ts';
import type {SubmitResult} from '../../requests.ts';

// FUNCTIONS

// Records a request. Exactly one of the site identifier and the site name is nonempty, as the caller has verified.
export const answer = async (siteID: string, rawSiteName: string, rawPageName: string, url: string, reason: string) => {
  const siteName = normalizeSpace(rawSiteName);
  const pageName = normalizeSpace(rawPageName);
  const nameCheck = [
    ...(siteID ? [] : [checkLength(siteName, nameBounds.site.min, nameBounds.site.max, 'site name')]),
    checkLength(pageName, nameBounds.page.min, nameBounds.page.max, 'page name')
  ].find(check => check.status === 'error');
  // If a name is too short or too long:
  if (nameCheck?.status === 'error') {
    return {status: 'error', message: nameCheck.message};
  }
  // Submit the request for management review.
  const result = await submitTestRequest({
    target: siteID ? {siteID, pageName, url} : {siteName, pageName, url}, reason, reviewImmediately: false
  }) as Exclude<SubmitResult, {result: 'nonreport' | 'ordered'}>;
  // If the request was recorded:
  if (result.result === 'pending') {
    const query = {
      description: htmlSafe(`${result.page.siteName} ${result.page.pageName}`),
      url: htmlSafe(url),
      reason: htmlSafe(reason),
      // A link to where to check for the result: the tested pages of an existing site, or else the tested sites.
      checkLink: `<a href="${siteID ? `/listPages.html/${siteID}` : '/listSites.html'}">check Kilotest</a>`
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
