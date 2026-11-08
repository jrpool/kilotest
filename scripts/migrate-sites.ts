/*
  migrate-sites.ts
  Step 4 of the site/page migration described in docs/decisions/011-site-page-ontology.md. Reads a reviewed site mapping and every report in the reports and hidden-reports directories, validates the mapping against the reports, and previews the plan: the sites and pages to be created, the merges of several descriptions into one page, and the reports to be updated. With --apply, after confirmation, it writes the site and page registry (registry.json in the data directory) and adds sources.siteID, sources.pageID, sources.siteName, and sources.pageName to every report that lacks them, changing nothing else.

  Usage:
    node scripts/migrate-sites.ts [--mapping path] [--apply] [--yes]

  The mapping defaults to docs/decisions/011-site-mapping.json. The data directory is the one Kilotest uses (DB_DIR, or db by default). Without --apply, nothing is written. With --apply, the script asks for confirmation unless --yes is given.

  The migration is idempotent. An existing registry is reused: a site is matched by name and a page by its site and name, so their identifiers are kept, and only missing sites and pages are created. Reports that already have sources.pageID are left unchanged. Therefore the script can be rerun after an interruption or after reports are restored from an older backup.

  The registry is written before any report, and every file is written to a temporary file that then replaces the original, so an interruption never leaves a report or the registry partly written, and every identifier in a report exists in the registry.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {getNewID, registryPath} from '../registry.ts';
import type {Registry} from '../registry.ts';
import {getJSON, hiddenReportsPath, reportsPath} from '../util.ts';

// TYPES

// An entry of the mapping file.
export type MappingEntry = {
  description: string;
  site: string;
  page: string;
};
// A report file and its content.
export type ReportFile = {
  filePath: string;
  report: any;
};
// The site and page properties added to the sources of a report.
export type SourcesUpdate = {
  siteID: string;
  pageID: string;
  siteName: string;
  pageName: string;
};
// The plan of a migration.
export type Plan = {
  errors: string[];
  warnings: string[];
  registry: Registry;
  newSiteIDs: string[];
  newPageIDs: string[];
  merges: {siteName: string; pageName: string; descriptions: string[]}[];
  updates: {filePath: string; sources: SourcesUpdate}[];
  alreadyMigrated: number;
};

// FUNCTIONS

// Returns the mapping entries in a parsed mapping file, or an error describing why it is invalid.
export const getMappingEntries = (mapping: unknown): MappingEntry[] | {error: string} => {
  const pages = (mapping as any)?.pages;
  // If the mapping has no pages array:
  if (!Array.isArray(pages)) {
    return {error: 'The mapping has no pages array.'};
  }
  const errors: string[] = [];
  const descriptions = new Set<string>();
  // For each entry:
  for (const [index, entry] of pages.entries()) {
    const {description, site, page} = entry ?? {};
    const label = typeof description === 'string' ? `“${description}”` : `entry ${index}`;
    // If any of its values is not a string:
    if (typeof description !== 'string' || typeof site !== 'string' || typeof page !== 'string') {
      errors.push(`${label} lacks a string description, site, or page.`);
      continue;
    }
    // If its site or page is empty or has surrounding or doubled white space:
    for (const [name, value] of [['site', site], ['page', page]]) {
      if (!value!.trim() || value !== value!.trim() || /\s\s/.test(value!)) {
        errors.push(`${label} has an empty or badly spaced ${name}: “${value}”.`);
      }
    }
    // If its description duplicates that of another entry:
    if (descriptions.has(description)) {
      errors.push(`${label} appears more than once.`);
    }
    descriptions.add(description);
  }
  // Return the error, if any, or the entries.
  if (errors.length) {
    return {error: errors.join('\n')};
  }
  return pages.map(({description, site, page}: MappingEntry) => ({description, site, page}));
};
// Returns the report files in a directory, and the names of any that are unreadable.
export const getReportFiles = (dir: string): {files: ReportFile[]; unreadable: string[]} => {
  const files: ReportFile[] = [];
  const unreadable: string[] = [];
  // If the directory does not exist, it has no reports.
  if (!fs.existsSync(dir)) {
    return {files, unreadable};
  }
  // For each report file:
  for (const fileName of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    const filePath = path.join(dir, fileName);
    try {
      files.push({filePath, report: JSON.parse(fs.readFileSync(filePath, 'utf8'))});
    }
    catch {
      unreadable.push(filePath);
    }
  }
  return {files, unreadable};
};
// Returns the plan of a migration, given the mapping entries, the report files, and the existing registry.
export const getPlan = (
  entries: MappingEntry[], reportFiles: ReportFile[], existingRegistry: Registry
): Plan => {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Copy the existing registry, which the plan extends.
  const registry: Registry = structuredClone(existingRegistry);
  const usedIDs = new Set([...Object.keys(registry.sites), ...Object.keys(registry.pages)]);
  const newSiteIDs: string[] = [];
  const newPageIDs: string[] = [];
  const entriesByDescription = new Map(entries.map(entry => [entry.description, entry]));
  // Get the reports to be updated, grouped by description, and identify invalid ones.
  const reportsByDescription = new Map<string, ReportFile[]>();
  let alreadyMigrated = 0;
  for (const reportFile of reportFiles) {
    const {filePath, report} = reportFile;
    const description = report?.target?.what;
    // If the report already has a page identifier:
    if (typeof report?.sources?.pageID === 'string') {
      alreadyMigrated++;
      // If the identifier is not in the registry:
      if (!registry.pages[report.sources.pageID]) {
        errors.push(`${filePath} has page identifier ${report.sources.pageID}, which is not in the registry.`);
      }
      continue;
    }
    // If the report has no description:
    if (typeof description !== 'string' || !description) {
      errors.push(`${filePath} has no target description.`);
      continue;
    }
    // If the mapping has no entry for the description:
    if (!entriesByDescription.has(description)) {
      errors.push(`${filePath} has the description “${description}”, which has no mapping entry.`);
      continue;
    }
    reportsByDescription.set(description, [...(reportsByDescription.get(description) ?? []), reportFile]);
  }
  // Identify mapping entries that no report needs.
  const unneeded = entries.filter(entry => !reportsByDescription.has(entry.description));
  if (unneeded.length) {
    warnings.push(`${unneeded.length} mapping entr${unneeded.length === 1 ? 'y has' : 'ies have'} no unmigrated report.`);
  }
  // Group the needed entries by site and then page, so that entries with identical sites and pages are merged.
  const groups = new Map<string, Map<string, MappingEntry[]>>();
  for (const entry of entries.filter(entry => reportsByDescription.has(entry.description))) {
    const sitePages = groups.get(entry.site) ?? new Map<string, MappingEntry[]>();
    sitePages.set(entry.page, [...(sitePages.get(entry.page) ?? []), entry]);
    groups.set(entry.site, sitePages);
  }
  const merges: Plan['merges'] = [];
  const updates: Plan['updates'] = [];
  // For each site:
  for (const [siteName, sitePages] of groups) {
    // Get its identifier, creating a site if none has its name.
    let siteID = Object.keys(registry.sites).find(id => registry.sites[id] === siteName);
    if (!siteID) {
      siteID = getNewID('site', usedIDs);
      registry.sites[siteID] = siteName;
      newSiteIDs.push(siteID);
    }
    // For each page of the site:
    for (const [pageName, pageEntries] of sitePages) {
      const pageReports = pageEntries.flatMap(entry => reportsByDescription.get(entry.description)!);
      // If several descriptions are merged into the page, record the merge.
      if (pageEntries.length > 1) {
        merges.push({siteName, pageName, descriptions: pageEntries.map(entry => entry.description)});
      }
      // Get its identifier, creating a page if the site has none with its name.
      let pageID = Object.keys(registry.pages)
      .find(id => registry.pages[id]!.name === pageName && registry.pages[id]!.sites.includes(siteID));
      if (!pageID) {
        pageID = getNewID('page', usedIDs);
        registry.pages[pageID] = {sites: [siteID], name: pageName, url: getLatestURL(pageReports)};
        newPageIDs.push(pageID);
      }
      // Plan the update of each of its reports.
      for (const {filePath} of pageReports) {
        updates.push({filePath, sources: {siteID, pageID, siteName, pageName}});
      }
    }
  }
  return {errors, warnings, registry, newSiteIDs, newPageIDs, merges, updates, alreadyMigrated};
};
// Returns the URL of the report with the latest completion time, or of the last report if none has one.
const getLatestURL = (reportFiles: ReportFile[]): string => {
  const sorted = [...reportFiles]
  .sort((a, b) => String(a.report?.jobData?.endTime ?? '').localeCompare(String(b.report?.jobData?.endTime ?? '')));
  return String(sorted.at(-1)?.report?.target?.url ?? '');
};
// Writes a file by replacing it with a completely written temporary file.
const writeAtomically = (filePath: string, content: string): void => {
  const tempPath = `${filePath}.migrating`;
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
};
// Applies a plan: writes the registry and then adds the site and page properties to the sources of each report.
export const applyPlan = (plan: Plan): void => {
  writeAtomically(registryPath(), getJSON(plan.registry));
  for (const {filePath, sources} of plan.updates) {
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    report.sources = {...(report.sources ?? {}), ...sources};
    writeAtomically(filePath, getJSON(report));
  }
};
// Returns the existing registry, or an empty one if there is none.
export const getRegistrySync = (): Registry => fs.existsSync(registryPath())
  ? JSON.parse(fs.readFileSync(registryPath(), 'utf8'))
  : {sites: {}, pages: {}};

// OPERATION

/* c8 ignore start */
// The command-line operation is exercised by running the script; its functions are tested separately.
if (import.meta.main) {
  const args = process.argv.slice(2);
  const mappingIndex = args.indexOf('--mapping');
  const mappingPath = mappingIndex > -1 && args[mappingIndex + 1]
    ? path.resolve(args[mappingIndex + 1]!)
    : path.join(import.meta.dirname, '..', 'docs', 'decisions', '011-site-mapping.json');
  const entries = getMappingEntries(JSON.parse(fs.readFileSync(mappingPath, 'utf8')));
  // If the mapping is invalid:
  if ('error' in entries) {
    console.error(`The mapping ${mappingPath} is invalid:\n${entries.error}`);
    process.exit(1);
  }
  const reports = getReportFiles(reportsPath());
  const hiddenReports = getReportFiles(hiddenReportsPath());
  const unreadable = [...reports.unreadable, ...hiddenReports.unreadable];
  const plan = getPlan(entries, [...reports.files, ...hiddenReports.files], getRegistrySync());
  plan.errors.unshift(...unreadable.map(filePath => `${filePath} is unreadable or not JSON.`));
  // Preview the plan.
  console.log(`Mapping: ${mappingPath}`);
  console.log(`Registry: ${registryPath()}`);
  console.log(`Reports: ${reports.files.length + reports.unreadable.length}; hidden reports: ${hiddenReports.files.length + hiddenReports.unreadable.length}`);
  console.log(`Reports already migrated: ${plan.alreadyMigrated}; reports to update: ${plan.updates.length}`);
  console.log(`Sites to create: ${plan.newSiteIDs.length}; pages to create: ${plan.newPageIDs.length}`);
  for (const merge of plan.merges) {
    console.log(`Merge into “${merge.siteName}” / “${merge.pageName}”: ${merge.descriptions.map(description => `“${description}”`).join(', ')}`);
  }
  for (const warning of plan.warnings) {
    console.log(`Warning: ${warning}`);
  }
  // If the plan has errors:
  if (plan.errors.length) {
    console.error(`\nThe migration cannot proceed:\n${plan.errors.join('\n')}`);
    process.exit(1);
  }
  // If the migration is not to be applied:
  if (!args.includes('--apply')) {
    console.log('\nPreview only. Nothing was written. Use --apply to migrate.');
    process.exit(0);
  }
  // If nothing remains to be done:
  if (!plan.updates.length) {
    console.log('\nNothing to migrate.');
    process.exit(0);
  }
  // Get confirmation unless it was given in advance.
  if (!args.includes('--yes')) {
    const prompt = readline.createInterface({input: process.stdin, output: process.stdout});
    const answer = await prompt.question('\nType “yes” to write the registry and update the reports: ');
    prompt.close();
    if (answer.trim() !== 'yes') {
      console.log('Not confirmed. Nothing was written.');
      process.exit(0);
    }
  }
  applyPlan(plan);
  console.log(`Wrote ${registryPath()} and updated ${plan.updates.length} report(s).`);
}
/* c8 ignore stop */
