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
// A request to add a page, to an existing site identified by siteID, or to a site named siteName that is created unless a site already has that name.
export type NewPage = ({siteID: string} | {siteName: string}) & {
  pageName: string;
  url: string;
};
// The result of an attempt to add a page.
export type AddPageResult = {siteID: string; pageID: string} | {error: 'noSite' | 'pageExists'};

// CONSTANTS

// Prefixes and lengths of the random parts of site and page identifiers.
const idFormats = {
  site: {prefix: 's-', length: 6},
  page: {prefix: 'p-', length: 8}
} as const;
// Patterns of valid site and page identifiers.
const siteIDPattern = new RegExp(`^${idFormats.site.prefix}[0-9a-z]{${idFormats.site.length}}$`);
const pageIDPattern = new RegExp(`^${idFormats.page.prefix}[0-9a-z]{${idFormats.page.length}}$`);

// VARIABLES

// Concurrency lock for the registry, created on first use rather than when this module is evaluated, so that the module can be imported by a module that it imports.
let registryLock: ReturnType<typeof createLock> | undefined;

// FUNCTIONS

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
// Returns the identifiers and records of the pages of a site, ordered by page name.
export const getSitePages = (registry: Registry, siteID: string): [string, PageRecord][] => Object
.entries(registry.pages)
.filter(([, page]) => page.sites.includes(siteID))
.sort(([, a], [, b]) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));
// Adds a page, and if necessary its site, to the registry as a transaction. A page cannot be added to a nonexistent site, nor with the name of a page the site already has.
export const addPage = (newPage: NewPage): Promise<AddPageResult> => changeRegistry(
  (registry): {write: boolean; result: AddPageResult} => {
    const usedIDs = new Set([...Object.keys(registry.sites), ...Object.keys(registry.pages)]);
    let siteID: string;
    // Name of the site to be created, if any.
    let newSiteName: string | undefined;
    // If the site is identified:
    if ('siteID' in newPage) {
      // If it does not exist:
      if (!(newPage.siteID in registry.sites)) {
        return {write: false, result: {error: 'noSite'}};
      }
      ({siteID} = newPage);
    }
    // Otherwise, i.e. if the site is named, get the site with the name, or a new identifier if none has it.
    else {
      const existingID = Object.keys(registry.sites).find(id => registry.sites[id] === newPage.siteName);
      if (existingID) {
        siteID = existingID;
      }
      else {
        siteID = getNewID('site', usedIDs);
        newSiteName = newPage.siteName;
      }
    }
    // If the site already has a page with the name:
    if (getSitePages(registry, siteID).some(([, page]) => page.name === newPage.pageName)) {
      return {write: false, result: {error: 'pageExists'}};
    }
    // If the site is new:
    if (newSiteName !== undefined) {
      // Create it.
      registry.sites[siteID] = newSiteName;
    }
    // Create the page.
    const pageID = getNewID('page', usedIDs);
    registry.pages[pageID] = {sites: [siteID], name: newPage.pageName, url: newPage.url};
    return {write: true, result: {siteID, pageID}};
  }
);
