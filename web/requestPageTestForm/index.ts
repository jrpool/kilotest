/*
  index.ts
  Serves a form for requesting a test of a page of a tested site.
*/

// IMPORTS

import {htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry, isSiteID} from '../../registry.ts';

// FUNCTIONS

// Returns a form for requesting a test of a page of a site.
export const answer = async (siteID: string) => {
  const registry = await getRegistry();
  const siteName = isSiteID(siteID) ? registry.sites[siteID] : undefined;
  // If the site does not exist:
  if (siteName === undefined) {
    return {
      status: 'error',
      message: 'Request for a nonexistent site'
    };
  }
  // Return the populated form.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {siteID, siteName: htmlSafe(siteName)})
  };
};
