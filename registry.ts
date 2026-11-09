/*
  registry.ts
  Reads and changes the site and page registry (registry.json in the data directory), as described in docs/decisions/011-site-page-ontology.md. The registry maps each site identifier to the site name, and each page identifier to the identifiers of the sites the page belongs to, the page name, and the page URL. It is the sole authority on which sites exist and which pages belong to them.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';
import {createLock, dbPath, getJSON, getRandomString} from './util.ts';

// TYPES

// A page in the registry.
export type PageRecord = {
  sites: string[];
  name: string;
  url: string;
};
// The site registry.
export type Registry = {
  sites: Record<string, string>;
  pages: Record<string, PageRecord>;
};
// The target of a test request: a new page of a site to be created (by site name), a new page of an existing site (by site identifier), or an existing page (by page identifier).
export type PageTarget
= {siteName: string; pageName: string; url: string}
| {siteID: string; pageName: string; url: string}
| {pageID: string};
// A page that a target resolves to. Its site and page identifiers are null if the site or page does not exist yet.
export type PlannedPage = {
  siteID: string | null;
  siteName: string;
  pageID: string | null;
  pageName: string;
  url: string;
};
// A page that a target resolves to, once registered.
export type RegisteredPage = PlannedPage & {siteID: string; pageID: string};
// The reason why a target cannot be resolved: The identified site or page does not exist, a site has a name that matches the requested site name, or the site has a page with the requested page name.
export type PageError
= {result: 'noSite' | 'noPage'}
| {result: 'siteExists'; siteID: string}
| {result: 'pageExists'; pageID: string};

// CONSTANTS

// Prefixes and lengths of the random parts of site and page identifiers.
const idFormats = {
  site: {prefix: 's-', length: 6},
  page: {prefix: 'p-', length: 8}
} as const;
// Second-level labels that, under a two-letter top-level domain, are part of a registrable domain (as in example.co.uk).
const secondLevelLabels = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);
// Patterns of valid site and page identifiers.
const siteIDPattern = new RegExp(`^${idFormats.site.prefix}[0-9a-z]{${idFormats.site.length}}$`);
const pageIDPattern = new RegExp(`^${idFormats.page.prefix}[0-9a-z]{${idFormats.page.length}}$`);

// VARIABLES

// Concurrency lock for the registry, created on first use rather than when this module is evaluated, so that the module can be imported by a module that it imports.
let registryLock: ReturnType<typeof createLock> | undefined;

// FUNCTIONS

// Returns a name normalized for matching: apostrophe and quotation-mark variants unified, white space collapsed, and letters lowercased.
export const normalizeName = (name: string): string => name
.normalize('NFC')
.replace(/[‘’ʼ`]/g, '\'')
.replace(/[“”]/g, '"')
.replace(/\s+/g, ' ')
.trim()
.toLowerCase();
// Returns a key under which site names that differ only in case, apostrophes, white space, or punctuation coincide: the normalized name without characters other than letters and digits. Matching keys make a requested site name unacceptable.
export const getNameKey = (name: string): string => normalizeName(name).replace(/[^\p{L}\p{N}]/gu, '');
// Returns a looser key, under which near-duplicate site names coincide: the name key of the name without its parenthesized parts. Matching keys make a site similar to a requested one.
export const getSiteKey = (name: string): string => getNameKey(name.replace(/\([^)]*\)/g, ''));
// Returns the host of a URL, or an empty string if the URL is invalid.
export const getHost = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  }
  catch {
    return '';
  }
};
// Returns an approximation of the registrable domain of a host, sufficient for flagging similarities but not for any decision.
export const getDomain = (host: string): string => {
  const labels = host.replace(/^www\./, '').split('.');
  const [tld = '', second = ''] = [labels.at(-1), labels.at(-2)];
  // If the host is under a second-level label of a two-letter top-level domain:
  if (tld.length === 2 && secondLevelLabels.has(second) && labels.length > 2) {
    // Return its last three labels.
    return labels.slice(-3).join('.');
  }
  // Otherwise, return its last two labels.
  return labels.slice(-2).join('.');
};
// Returns the path of the registry.
export const registryPath = (): string => path.join(dbPath(), 'registry.json');
// Returns whether a value is a valid site identifier.
export const isSiteID = (value: unknown): value is string => typeof value === 'string' && siteIDPattern.test(value);
// Returns whether a value is a valid page identifier.
export const isPageID = (value: unknown): value is string => typeof value === 'string' && pageIDPattern.test(value);
// Returns a new site or page identifier not in a set of used identifiers, and adds it to the set.
export const getNewID = (type: 'site' | 'page', usedIDs: Set<string>): string => {
  const {prefix, length} = idFormats[type];
  let id: string;
  // Generate identifiers until one is unused.
  do {
    id = `${prefix}${getRandomString(length)}`;
  } while (usedIDs.has(id));
  usedIDs.add(id);
  return id;
};
// Returns the registry, or an empty one if none exists. Throws if the registry exists but cannot be read or parsed, because treating it as empty would let the next change overwrite it.
export const getRegistry = async (): Promise<Registry> => {
  let registryJSON: string;
  try {
    registryJSON = await fs.readFile(registryPath(), 'utf8');
  }
  catch (error: unknown) {
    // If the registry does not exist:
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return an empty one.
      return {sites: {}, pages: {}};
    }
    throw new Error('Registry unreadable', {cause: error});
  }
  try {
    return JSON.parse(registryJSON);
  }
  catch (error: unknown) {
    throw new Error('Registry not JSON', {cause: error});
  }
};
// Writes the registry by replacing it with a completely written temporary file, so that an interruption never leaves it partly written.
const writeRegistry = async (registry: Registry): Promise<void> => {
  const tempPath = `${registryPath()}.writing`;
  await fs.writeFile(tempPath, getJSON(registry));
  await fs.rename(tempPath, registryPath());
};
// Applies a change to the registry as a transaction and returns the change’s result. The change mutates the registry it receives, which is written only if the change returns {write: true}.
export const changeRegistry = <T>(
  change: (registry: Registry) => {write: boolean; result: T}
): Promise<T> => (registryLock ??= createLock())(async (): Promise<T> => {
  const registry = await getRegistry();
  const {write, result} = change(registry);
  // If the change is to be saved:
  if (write) {
    // Save it.
    await writeRegistry(registry);
  }
  return result;
});
// Returns the display name of a page in a registry (the name of its first site followed by its own name), or a fallback if the page is not in the registry.
export const getPageTitle = (registry: Registry, pageID: string, fallback: string): string => {
  const page = registry.pages[pageID];
  return page ? `${registry.sites[page.sites[0] as string]} ${page.name}` : fallback;
};
// Returns the identifiers and records of the pages of a site, ordered by page name.
export const getSitePages = (registry: Registry, siteID: string): [string, PageRecord][] => Object
.entries(registry.pages)
.filter(([, page]) => page.sites.includes(siteID))
.sort(([, a], [, b]) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));
// Returns the page that a target resolves to in a registry, or the reason why it cannot be resolved. A page cannot be added to a nonexistent site, nor with a name that, after normalization, is that of a page the site already has, and a site cannot be created with a name whose name key is that of an existing site.
export const planPage = (registry: Registry, target: PageTarget): PlannedPage | PageError => {
  // If the target is an existing page:
  if ('pageID' in target) {
    const page = registry.pages[target.pageID];
    // If it does not exist:
    if (!page) {
      return {result: 'noPage'};
    }
    const siteID = page.sites[0] as string;
    return {
      siteID, siteName: registry.sites[siteID] as string, pageID: target.pageID, pageName: page.name, url: page.url
    };
  }
  const {pageName, url} = target;
  // If the target is a new page of an existing site:
  if ('siteID' in target) {
    const {siteID} = target;
    const siteName = registry.sites[siteID];
    // If the site does not exist:
    if (siteName === undefined) {
      return {result: 'noSite'};
    }
    const pageKey = normalizeName(pageName);
    const namesake = getSitePages(registry, siteID).find(([, page]) => normalizeName(page.name) === pageKey);
    // If the site already has a page with the name:
    if (namesake) {
      return {result: 'pageExists', pageID: namesake[0]};
    }
    return {siteID, siteName, pageID: null, pageName, url};
  }
  // Otherwise, i.e. if the target is a new page of a new site:
  const nameKey = getNameKey(target.siteName);
  const namesakeID = Object.keys(registry.sites).find(id => getNameKey(registry.sites[id] as string) === nameKey);
  // If a site has a matching name:
  if (namesakeID) {
    return {result: 'siteExists', siteID: namesakeID};
  }
  return {siteID: null, siteName: target.siteName, pageID: null, pageName, url};
};
// Returns whether the resolution of a target is an error.
export const isPageError = (page: PlannedPage | PageError): page is PageError => 'result' in page;
// Registers the page that a target resolves to, and if necessary its site, as a transaction, and returns the page or the reason why the target cannot be resolved.
export const registerPage = (target: PageTarget): Promise<RegisteredPage | PageError> => changeRegistry(
  (registry): {write: boolean; result: RegisteredPage | PageError} => {
    const page = planPage(registry, target);
    // If the target cannot be resolved:
    if (isPageError(page)) {
      return {write: false, result: page};
    }
    // If the page already exists:
    if (page.siteID && page.pageID) {
      return {write: false, result: page as RegisteredPage};
    }
    const usedIDs = new Set([...Object.keys(registry.sites), ...Object.keys(registry.pages)]);
    // If the site is new:
    if (!page.siteID) {
      // Create it.
      page.siteID = getNewID('site', usedIDs);
      registry.sites[page.siteID] = page.siteName;
    }
    // Create the page.
    const pageID = getNewID('page', usedIDs);
    registry.pages[pageID] = {sites: [page.siteID], name: page.pageName, url: page.url};
    return {write: true, result: {...page, siteID: page.siteID, pageID}};
  }
);
