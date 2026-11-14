/*
  index.ts
  Serves a form for revising the registrations of a site and its pages: the name of the site and the name and URL of each page. Without a site identifier, serves a list of the sites, each linked to its form. Revisions change only the registry, which holds the current names and URLs; the names and URLs in reports are historical (see docs/decisions/011-site-page-ontology.md).
*/

// IMPORTS

import {alphaCompare, checkLength, htmlSafe, isAllowedTarget, isURL, isValidAuthCode, populateTemplate} from '../../util.ts';
import {getPageTitle, getRegistry, getSitePages, isSiteID, reviseRegistrations} from '../../registry.ts';
import type {PageRecord, Registry} from '../../registry.ts';
import {nameBounds, normalizeSpace} from '../../requests.ts';

// TYPES

// The values of the form controls: the site name and, by page identifier, the name and URL of each page.
type FormValues = {
  siteName: string;
  pages: Record<string, {name: string; url: string}>;
};

// CONSTANTS

// Prefixes of the names of the form controls for page names and URLs, each followed by a page identifier.
const namePrefix = 'name.';
const urlPrefix = 'url.';
// Bounds of the length of a URL, as for a requested test.
const urlBounds = {min: 12, max: 300} as const;
const margin = ' '.repeat(6);

// FUNCTIONS

// Returns the lines of a list of the sites, each linked to its form.
const getSiteLines = (registry: Registry): string[] => [
  `${margin}<p>Choose a site.</p>`,
  `${margin}<ul class="links">`,
  ...Object.entries(registry.sites)
  .sort(([, a], [, b]) => alphaCompare(a, b))
  .map(([siteID, name]) => `${margin}  <li><a href="/reregisterForm.html/${siteID}">${htmlSafe(name)}</a></li>`),
  `${margin}</ul>`
];
// Returns the identifiers and records of the pages of a site in the order of the form: by registered URL rather than by name, so that pages of the same kind are adjacent. The serial number by which the form labels a page is its position in this order.
const getOrderedPages = (registry: Registry, siteID: string): [string, PageRecord][] =>
  getSitePages(registry, siteID).sort(([, a], [, b]) => alphaCompare(a.url, b.url));
// Returns the lines of the form for a site, with given values of its controls and an optional message about a success or an error.
const getFormLines = (
  registry: Registry, siteID: string, values: FormValues, message: {type: 'status' | 'alert'; text: string} | null
): string[] => [
  // A message about an error has the error class, which makes it conspicuous, and is focused, so that it is announced when the page is loaded; one about a success is only emphasized.
  ...(message ? [message.type === 'alert'
    ? `${margin}<p role="alert" class="error" tabindex="-1" autofocus>${htmlSafe(message.text)}</p>`
    : `${margin}<p role="status"><strong>${htmlSafe(message.text)}</strong></p>`] : []),
  `${margin}<p>Edit any values to be revised. Unedited values remain unchanged. By convention, the home page of a site is named “home”.</p>`,
  `${margin}<form action="/reregisterForm.html" method="post">`,
  `${margin}  <input type="hidden" name="siteID" value="${siteID}">`,
  `${margin}  <p><label>`,
  `${margin}    Site name:`,
  `${margin}    <input size="50" maxlength="${nameBounds.site.max}" name="siteName" value="${htmlSafe(values.siteName)}" required>`,
  `${margin}  </label></p>`,
  `${margin}  <h2>Page registrations</h2>`,
  ...getOrderedPages(registry, siteID).flatMap(([pageID, page], index) => {
    const {name, url} = values.pages[pageID] ?? page;
    return [
      `${margin}  <fieldset>`,
      `${margin}    <legend>page ${index + 1}</legend>`,
      `${margin}    <p><label>`,
      `${margin}      Name:`,
      `${margin}      <input size="50" maxlength="${nameBounds.page.max}" name="${namePrefix}${pageID}" value="${htmlSafe(name)}" required>`,
      `${margin}    </label></p>`,
      `${margin}    <p><label>`,
      `${margin}      URL:`,
      `${margin}      <input type="url" size="70" minlength="${urlBounds.min}" maxlength="${urlBounds.max}" name="${urlPrefix}${pageID}" value="${htmlSafe(url)}" required>`,
      `${margin}    </label></p>`,
      `${margin}    <p><a href="${htmlSafe(page.url)}">Open page ${index + 1} (${htmlSafe(page.name)})</a></p>`,
      `${margin}  </fieldset>`
    ];
  }),
  `${margin}  <p><label>`,
  `${margin}    Authorization code: <input size="3" minlength="3" maxlength="3" name="authCode" required>`,
  `${margin}  </label></p>`,
  `${margin}  <p><button type="submit">Submit</button></p>`,
  `${margin}</form>`,
  `${margin}<p>You can also <a href="/reregisterForm.html">choose another site</a>.</p>`
];
// Returns the first error in submitted values, or null if there is none. Only a revised URL is checked for being an allowed target, because that check requires a DNS lookup.
const getFirstError = async (registry: Registry, siteID: string, values: FormValues): Promise<string | null> => {
  const siteCheck = checkLength(values.siteName, nameBounds.site.min, nameBounds.site.max, 'site name');
  // If the site name has an invalid length:
  if (siteCheck.status === 'error') {
    return siteCheck.message;
  }
  // For each page of the site, in the order of the form:
  for (const [index, [pageID, page]] of getOrderedPages(registry, siteID).entries()) {
    const {name, url} = values.pages[pageID] as {name: string; url: string};
    const label = `page ${index + 1}`;
    const nameCheck = checkLength(name, nameBounds.page.min, nameBounds.page.max, `name of ${label}`);
    // If its name has an invalid length:
    if (nameCheck.status === 'error') {
      return nameCheck.message;
    }
    // If its URL is invalid:
    if (!isURL(url) || url.length < urlBounds.min || url.length > urlBounds.max) {
      return `The URL of ${label} must start with https:// and be between ${urlBounds.min} and ${urlBounds.max} characters long`;
    }
    // If its URL is revised and is not an allowed target:
    if (url !== page.url && !await isAllowedTarget(url)) {
      return `The URL of ${label} is not one that Kilotest is allowed to test`;
    }
  }
  return null;
};
// Returns the list of sites, or the form for a site. A GET request never processes a submission, regardless of its query string; only a POST request (the form's own submission) does. A submission with an erroneous value changes nothing and is answered with the form, containing the submitted values and a message about the first error.
export const answer = async (pathTail: string, search: string, method: string) => {
  const searchParams = new URLSearchParams(search);
  const isSubmission = method === 'POST';
  const siteID = isSubmission ? searchParams.get('siteID') : pathTail;
  // If the form has been submitted and the authorization code or the site identifier is invalid:
  if (isSubmission && !(isValidAuthCode(searchParams.get('authCode')) && isSiteID(siteID))) {
    // Report the error, deliberately vague so as not to confirm to an attacker that the authorization code specifically (as opposed to some other part of the request) is what was wrong.
    return {status: 'error', message: 'Invalid request'};
  }
  let registry = await getRegistry();
  // If a site is specified but does not exist:
  if (siteID && !(isSiteID(siteID) && registry.sites[siteID] !== undefined)) {
    return {status: 'error', message: 'Request for nonexistent site'};
  }
  // Returns the populated page with given lines of content.
  const getPage = async (lines: string[]) => ({
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {content: lines.join('\n')})
  });
  // If no site is specified:
  if (!siteID) {
    // Return the list of sites.
    return getPage(getSiteLines(registry));
  }
  const currentValues: FormValues = {siteName: registry.sites[siteID] as string, pages: {}};
  // If the form has not been submitted:
  if (!isSubmission) {
    // Return it, with the current values.
    return getPage(getFormLines(registry, siteID, currentValues, null));
  }
  const values: FormValues = {
    siteName: normalizeSpace(searchParams.get('siteName') ?? currentValues.siteName),
    pages: {}
  };
  // For each submitted value:
  for (const [key, value] of searchParams) {
    // If it is the name of a page:
    if (key.startsWith(namePrefix)) {
      (values.pages[key.slice(namePrefix.length)] ??= {name: '', url: ''}).name = normalizeSpace(value);
    }
    // Otherwise, if it is the URL of a page:
    else if (key.startsWith(urlPrefix)) {
      (values.pages[key.slice(urlPrefix.length)] ??= {name: '', url: ''}).url = value.trim();
    }
  }
  // For each page of the site with neither a name nor a URL submitted:
  for (const [pageID, page] of getSitePages(registry, siteID).filter(([id]) => !values.pages[id])) {
    // Its current name and URL are to remain unchanged.
    values.pages[pageID] = {name: page.name, url: page.url};
  }
  let error = await getFirstError(registry, siteID, values);
  // If no value is erroneous:
  if (!error) {
    // Revise the registrations, all or none.
    const revision = await reviseRegistrations(siteID, values.siteName, values.pages);
    registry = await getRegistry();
    // If the revision succeeded:
    if (revision.result === 'ok') {
      const {changeCount} = revision;
      const text = changeCount
        ? `${changeCount} ${changeCount === 1 ? 'value was' : 'values were'} revised.`
        : 'No values were revised.';
      // Return the form, with the revised values.
      return getPage(getFormLines(
        registry, siteID, {siteName: registry.sites[siteID] as string, pages: {}}, {type: 'status', text}
      ));
    }
    // Otherwise, if the site name matches that of another site:
    if (revision.result === 'siteExists') {
      error = `The site name is too similar to that of the site “${registry.sites[revision.siteID]}”`;
    }
    // Otherwise, if two pages would have the same name:
    else if (revision.result === 'pageExists') {
      error = `Two pages would be named “${revision.name}”`;
    }
    // Otherwise, if a revised URL is equivalent to that of another page:
    else if (revision.result === 'urlExists') {
      const serial = getOrderedPages(registry, siteID).findIndex(([pageID]) => pageID === revision.pageID) + 1;
      error = `The URL of page ${serial} is equivalent to that of the page “${getPageTitle(registry, revision.otherPageID, '')}”`;
    }
    // Otherwise, i.e. if a name or URL was submitted for a page that is not a page of the site, or the site was removed from the registry after the form was submitted:
    else {
      return {status: 'error', message: 'Request for nonexistent site or page'};
    }
  }
  // Return the form, with the submitted values and a message about the error.
  return getPage(getFormLines(registry, siteID, values, {type: 'alert', text: `Nothing was revised. ${error}.`}));
};
