/*
  index.ts
  Serves a form for requesting a test of a page not yet tested: of the site identified in the path if there is one, or else of a site that the requester names.
*/

// IMPORTS

import {htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry, isSiteID} from '../../registry.ts';

// FUNCTIONS

// Returns a form for requesting a test, for an existing site if a site identifier is given.
export const answer = async (siteID = '') => {
  const margin = ' '.repeat(6);
  let query: Record<string, string>;
  // If a site is identified:
  if (siteID) {
    const registry = await getRegistry();
    const siteName = isSiteID(siteID) ? registry.sites[siteID] : undefined;
    // If it does not exist:
    if (siteName === undefined) {
      return {
        status: 'error',
        message: 'Request for a nonexistent site'
      };
    }
    const safeName = htmlSafe(siteName);
    query = {
      forSite: ` for a page of ${safeName}`,
      intro: `${margin}<p>Here you may request testing of an untested page of ${safeName}. All answers are required.</p>`,
      siteField: `${margin}  <input type="hidden" name="siteID" value="${siteID}">`
    };
  }
  // Otherwise, i.e. if the site is to be named:
  else {
    query = {
      forSite: '',
      intro: `${margin}<p>Here you may request testing of an untested site. All answers are required.</p>`,
      siteField: [
        `${margin}  <p><label>`,
        `${margin}    Site name (e.g., <q>Archaic Technologies</q>, <q>Université de Gaspillage</q>, <q>Neptune Department of Injustice</q>)<br>`,
        `${margin}    <input size="50" maxlength="80" name="siteName" required>`,
        `${margin}  </label></p>`
      ].join('\n')
    };
  }
  // Return the populated form.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, query)
  };
};
