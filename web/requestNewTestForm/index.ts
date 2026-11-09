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
      intro: `${margin}<p>You may request that a page of <q>${safeName}</q> be tested by submitting the following form. Before you do, check the <a href="/listPages.html/${siteID}">pages of this site already tested</a>. All answers are required.</p>`,
      siteField: `${margin}  <input type="hidden" name="siteID" value="${siteID}">`
    };
  }
  // Otherwise, i.e. if the site is to be named:
  else {
    query = {
      forSite: '',
      intro: `${margin}<p>You may request that a web page of a site not yet tested be tested by submitting the following form. If the site is in the <a href="/listSites.html">list of tested sites</a>, request the test from the list of its tested pages instead. All answers are required.</p>`,
      siteField: [
        `${margin}  <p><label>`,
        `${margin}    What is the name of the site (usually the name of the organization or brand that presents it)?<br>`,
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
