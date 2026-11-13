/*
  index.ts
  Serves a form for revising the name of a site and the names of its pages. Without a site identifier, serves a list of the sites, each linked to its form. Revisions change only the registry, which holds the current names; the names in the sources of reports are historical (see docs/decisions/011-site-page-ontology.md).
*/

// IMPORTS

import {alphaCompare, checkLength, htmlSafe, isValidAuthCode, populateTemplate} from '../../util.ts';
import {getRegistry, getSitePages, isSiteID, reviseNames} from '../../registry.ts';
import type {Registry} from '../../registry.ts';
import {nameBounds, normalizeSpace} from '../../requests.ts';

// CONSTANTS

// Prefix of the names of the form controls for page names, each followed by a page identifier.
const pagePrefix = 'page.';
const margin = ' '.repeat(6);

// FUNCTIONS

// Returns the lines of a list of the sites, each linked to its form.
const getSiteLines = (registry: Registry): string[] => [
  `${margin}<p>Choose a site.</p>`,
  `${margin}<ul class="links">`,
  ...Object.entries(registry.sites)
  .sort(([, a], [, b]) => alphaCompare(a, b))
  .map(([siteID, name]) => `${margin}  <li><a href="/renameForm.html/${siteID}">${htmlSafe(name)}</a></li>`),
  `${margin}</ul>`
];
// Returns the lines of the form for a site. Pages are ordered by URL rather than by name, so that pages of the same kind are adjacent and the order does not change when names are revised, and each URL is a link, so that the page can be inspected before it is named.
const getFormLines = (registry: Registry, siteID: string, notice: string): string[] => {
  const pages = getSitePages(registry, siteID).sort(([, a], [, b]) => alphaCompare(a.url, b.url));
  return [
    ...(notice ? [`${margin}<p role="status"><strong>${htmlSafe(notice)}</strong></p>`] : []),
    `${margin}<p>Edit any names to be revised. Unedited names remain unchanged. By convention, the home page of a site is named “home”.</p>`,
    `${margin}<form action="/renameForm.html" method="post">`,
    `${margin}  <input type="hidden" name="siteID" value="${siteID}">`,
    `${margin}  <p><label>`,
    `${margin}    Site name:`,
    `${margin}    <input size="50" maxlength="${nameBounds.site.max}" name="siteName" value="${htmlSafe(registry.sites[siteID] as string)}" required>`,
    `${margin}  </label></p>`,
    `${margin}  <fieldset>`,
    `${margin}    <legend>Page names</legend>`,
    ...pages.flatMap(([pageID, page]) => [
      `${margin}    <p>`,
      `${margin}      <label for="${pageID}"><a href="${htmlSafe(page.url)}"><code>${htmlSafe(page.url)}</code></a></label><br>`,
      `${margin}      <input id="${pageID}" size="50" maxlength="${nameBounds.page.max}" name="${pagePrefix}${pageID}" value="${htmlSafe(page.name)}" required>`,
      `${margin}    </p>`
    ]),
    `${margin}  </fieldset>`,
    `${margin}  <p><label>`,
    `${margin}    Authorization code: <input size="3" minlength="3" maxlength="3" name="authCode" required>`,
    `${margin}  </label></p>`,
    `${margin}  <p><button type="submit">Submit</button></p>`,
    `${margin}</form>`,
    `${margin}<p>You can also <a href="/renameForm.html">choose another site</a>.</p>`
  ];
};
// Returns the list of sites, or the form for a site. A GET request never processes a submission, regardless of its query string; only a POST request (the form's own submission) does.
export const answer = async (pathTail: string, search: string, method: string) => {
  const searchParams = new URLSearchParams(search);
  const isSubmission = method === 'POST';
  const siteID = isSubmission ? searchParams.get('siteID') : pathTail;
  let notice = '';
  // If the form has been submitted:
  if (isSubmission) {
    // If the authorization code or the site identifier is invalid:
    if (!isValidAuthCode(searchParams.get('authCode')) || !isSiteID(siteID)) {
      // Report the error, deliberately vague so as not to confirm to an attacker that the authorization code specifically (as opposed to some other part of the request) is what was wrong.
      return {status: 'error', message: 'Invalid request'};
    }
    const rawSiteName = searchParams.get('siteName');
    // Get the submitted site name, if any; without one, the site name is to remain unchanged.
    const siteName = rawSiteName === null ? null : normalizeSpace(rawSiteName);
    const pageNames: Record<string, string> = {};
    // For each submitted page name:
    for (const [key, value] of searchParams) {
      if (key.startsWith(pagePrefix)) {
        pageNames[key.slice(pagePrefix.length)] = normalizeSpace(value);
      }
    }
    const lengthError = [
      ...(siteName === null ? [] : [checkLength(siteName, nameBounds.site.min, nameBounds.site.max, 'site name')]),
      ...Object.values(pageNames)
      .map(pageName => checkLength(pageName, nameBounds.page.min, nameBounds.page.max, 'page name'))
    ].find(check => check.status === 'error');
    // If any name has an invalid length:
    if (lengthError) {
      return lengthError;
    }
    // Revise the names, all or none.
    const revision = await reviseNames(siteID, siteName, pageNames);
    // If the revision was refused:
    if (revision.result !== 'ok') {
      let why: string;
      if (revision.result === 'noSite') {
        why = 'the site does not exist';
      }
      else if (revision.result === 'noPage') {
        why = 'a page does not exist or does not belong to the site';
      }
      else if (revision.result === 'siteExists') {
        why = `the site name is too similar to that of the site “${(await getRegistry()).sites[revision.siteID]}”`;
      }
      else {
        why = `two pages would be named “${revision.name}”`;
      }
      return {status: 'error', message: `No names were revised, because ${why}`};
    }
    const {changeCount} = revision;
    notice = changeCount ? `${changeCount} ${changeCount === 1 ? 'name was' : 'names were'} revised.` : 'No names were revised.';
  }
  const registry = await getRegistry();
  // If a site is specified but does not exist:
  if (siteID && !(isSiteID(siteID) && registry.sites[siteID] !== undefined)) {
    return {status: 'error', message: 'Request for nonexistent site'};
  }
  const lines = siteID ? getFormLines(registry, siteID, notice) : getSiteLines(registry);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {content: lines.join('\n')})
  };
};
