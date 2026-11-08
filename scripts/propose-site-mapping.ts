/*
  propose-site-mapping.ts
  Dry-run step 1 of the site/page migration described in docs/decisions/011-site-page-ontology.md. Reads every report in the reports and hidden-reports directories, proposes a site name and a page name for each distinct page description, flags proposals that need human review, and writes a reviewable mapping file. It never modifies any report.

  Usage:
    node scripts/propose-site-mapping.ts [--output path] [--force]

  The data directory is the one Kilotest uses (DB_DIR, or db by default). The mapping file defaults to siteMapping.json in that directory. Because the maintainer edits the mapping file, an existing one is never overwritten unless --force is given.

  Proposal method: a description whose words begin with all the words of another description is a page of the site named by the shortest description in that chain of prefixes, and the remaining words are its page name; any other description names a site, and is its home page. Matching ignores case, apostrophe and quotation-mark variants, and extra white space. A remainder beginning with a parenthesis is treated as part of a name, not as a page name, so “X (Y)” is not proposed as a page of “X”.
*/

// IMPORTS

import fs from 'node:fs';
import path from 'node:path';
import {hiddenReportsPath, minifyURL, reportsPath} from '../util.ts';

// TYPES

// Facts about one distinct page description, gathered from the reports that carry it.
export type PageRecord = {
  description: string;
  urls: string[];
  reportIDs: string[];
  hiddenReportIDs: string[];
};
// A reason for reviewing a proposal.
export type Flag = {
  code: FlagCode;
  detail: string;
};
// The codes of the reasons for reviewing a proposal.
export type FlagCode
= 'notHomeURL'
| 'chainedPrefix'
| 'variantSpelling'
| 'otherHost'
| 'multipleURLs'
| 'sharedURL'
| 'nearDuplicateSite'
| 'sharedDomain'
| 'hiddenOnly';
// The proposal for one distinct page description.
export type PageProposal = {
  description: string;
  site: string;
  page: string;
  flags: Flag[];
  urls: string[];
  reportCount: number;
  hiddenReportCount: number;
};

// CONSTANTS

// Explanations of the flag codes, written into the mapping file for its reviewer.
export const flagExplanations: Record<FlagCode, string> = {
  notHomeURL: 'Proposed as a home page, but its URL has a path, so it may instead be a page of a site with no home-page entry (site-assignment rule 3).',
  chainedPrefix: 'Its description extends a description that itself extends another, so the proposed page name contains an intermediate page name.',
  variantSpelling: 'It matched its site only after normalizing case, apostrophes, quotation marks, or white space, so the site name should be unified (site-assignment rule 4).',
  otherHost: 'Its host belongs to a different domain from the home page of its proposed site, so it may belong to another site (site-assignment rules 1 and 2).',
  multipleURLs: 'Reports with this description have different URLs.',
  sharedURL: 'Another description has a report with the same URL.',
  nearDuplicateSite: 'Its proposed site name differs from another proposed site name only in case, punctuation, or a parenthesized abbreviation (site-assignment rule 4).',
  sharedDomain: 'The home page of its proposed site has the same domain as the home page of another proposed site.',
  hiddenOnly: 'All reports with this description are hidden, so the page is not a tested page.'
};
// Second-level labels that, under a two-letter top-level domain, are part of a registrable domain (as in example.co.uk).
const secondLevelLabels = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);

// FUNCTIONS

// Returns a name normalized for matching: apostrophe and quotation-mark variants unified, white space collapsed, and letters lowercased.
export const normalizeName = (name: string): string => name
.normalize('NFC')
.replace(/[‘’ʼ`]/g, '\'')
.replace(/[“”]/g, '"')
.replace(/\s+/g, ' ')
.trim()
.toLowerCase();
// Returns the words of a name.
const getWords = (name: string): string[] => name.trim().split(/\s+/);
// Returns a key under which near-duplicate site names coincide: the normalized name without parenthesized parts or characters other than letters and digits.
export const getSiteKey = (name: string): string => normalizeName(name)
.replace(/\([^)]*\)/g, '')
.replace(/[^\p{L}\p{N}]/gu, '');
// Returns the host of a URL, or an empty string if the URL is invalid.
const getHost = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  }
  catch {
    return '';
  }
};
// Returns an approximation of the registrable domain of a host, sufficient for flagging proposals for review but not for any decision.
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
// Returns whether the path of a URL is that of a home page.
const isHomeURL = (url: string): boolean => {
  try {
    return ['', '/'].includes(new URL(url).pathname);
  }
  catch {
    return false;
  }
};
// Returns the description of the parent of a page record: the longest other description whose words begin its words, unless the remaining words begin with a parenthesis.
const getParent = (description: string, descriptions: string[]): string | null => {
  const words = getWords(normalizeName(description));
  let parent: string | null = null;
  let parentLength = 0;
  // For each other description:
  for (const candidate of descriptions) {
    const candidateWords = getWords(normalizeName(candidate));
    // If it is a proper word prefix of the description and longer than any prefix already found:
    if (
      candidateWords.length < words.length
      && candidateWords.length > parentLength
      && candidateWords.every((word, index) => word === words[index])
      && !words[candidateWords.length]?.startsWith('(')
    ) {
      // Make it the parent.
      parent = candidate;
      parentLength = candidateWords.length;
    }
  }
  return parent;
};
// Returns proposals for page records, sorted by site name and then page name, with the home page first.
export const proposeMapping = (records: PageRecord[]): PageProposal[] => {
  const descriptions = records.map(record => record.description);
  const parents = new Map(descriptions.map(description => [description, getParent(description, descriptions)]));
  const recordsByDescription = new Map(records.map(record => [record.description, record]));
  // Get the minified URLs and the descriptions that have reports with each.
  const descriptionsByURL = new Map<string, Set<string>>();
  for (const record of records) {
    for (const url of record.urls) {
      const miniURL = minifyURL(url);
      const urlDescriptions = descriptionsByURL.get(miniURL) ?? new Set<string>();
      urlDescriptions.add(record.description);
      descriptionsByURL.set(miniURL, urlDescriptions);
    }
  }
  // Initialize the proposals.
  const proposals: PageProposal[] = records.map(record => {
    const flags: Flag[] = [];
    // Follow the chain of parents to its root, which names the site.
    const chain: string[] = [];
    let root = record.description;
    let parent = parents.get(root) ?? null;
    while (parent) {
      chain.push(parent);
      root = parent;
      parent = parents.get(root) ?? null;
    }
    const isHome = root === record.description;
    const rootWordCount = getWords(root).length;
    const page = isHome ? 'home' : getWords(record.description).slice(rootWordCount).join(' ');
    // If the page is proposed as a home page but its URL has a path:
    const nonHomeURLs = record.urls.filter(url => !isHomeURL(url));
    if (isHome && nonHomeURLs.length) {
      flags.push({code: 'notHomeURL', detail: `URL path: ${nonHomeURLs.map(url => new URL(url).pathname).join(', ')}`});
    }
    // If the chain of parents has an intermediate page:
    if (chain.length > 1) {
      flags.push({code: 'chainedPrefix', detail: `Intermediate description: “${chain[0]}”`});
    }
    // If the page matched its site only after normalization:
    if (!isHome && !getWords(record.description).slice(0, rootWordCount).every((word, index) => word === getWords(root)[index])) {
      flags.push({code: 'variantSpelling', detail: `Site spelled “${root}”`});
    }
    // If the page is not a home page and its domain differs from that of its site’s home page:
    const rootDomains = new Set((recordsByDescription.get(root)?.urls ?? []).map(url => getDomain(getHost(url))));
    const otherDomains = [...new Set(record.urls.map(url => getDomain(getHost(url))))]
    .filter(domain => !rootDomains.has(domain));
    if (!isHome && otherDomains.length) {
      flags.push({code: 'otherHost', detail: `Domain ${otherDomains.join(', ')}; site home page domain ${[...rootDomains].join(', ')}`});
    }
    // If the reports with this description have different URLs:
    const miniURLs = [...new Set(record.urls.map(minifyURL))];
    if (miniURLs.length > 1) {
      flags.push({code: 'multipleURLs', detail: record.urls.join(', ')});
    }
    // If another description has a report with the same URL:
    const sharers = [...new Set(miniURLs.flatMap(miniURL => [...(descriptionsByURL.get(miniURL) ?? [])]))]
    .filter(description => description !== record.description);
    if (sharers.length) {
      flags.push({code: 'sharedURL', detail: `Also: ${sharers.map(description => `“${description}”`).join(', ')}`});
    }
    // If all the reports with this description are hidden:
    if (!record.reportIDs.length) {
      flags.push({code: 'hiddenOnly', detail: `${record.hiddenReportIDs.length} hidden report(s)`});
    }
    return {
      description: record.description,
      site: root,
      page,
      flags,
      urls: record.urls,
      reportCount: record.reportIDs.length,
      hiddenReportCount: record.hiddenReportIDs.length
    };
  });
  // Get the proposed site names, grouped by their near-duplicate keys and by their home-page domains.
  const siteNames = [...new Set(proposals.map(proposal => proposal.site))];
  const sitesByKey = new Map<string, string[]>();
  const sitesByDomain = new Map<string, string[]>();
  for (const siteName of siteNames) {
    const key = getSiteKey(siteName);
    sitesByKey.set(key, [...(sitesByKey.get(key) ?? []), siteName]);
    const domains = new Set((recordsByDescription.get(siteName)?.urls ?? []).map(url => getDomain(getHost(url))));
    for (const domain of domains) {
      sitesByDomain.set(domain, [...(sitesByDomain.get(domain) ?? []), siteName]);
    }
  }
  // For each home-page proposal:
  for (const proposal of proposals.filter(proposal => proposal.page === 'home' && proposal.site === proposal.description)) {
    // If another site name is a near duplicate of its site name:
    const keyMates = (sitesByKey.get(getSiteKey(proposal.site)) ?? []).filter(name => name !== proposal.site);
    if (keyMates.length) {
      proposal.flags.push({code: 'nearDuplicateSite', detail: `Also: ${keyMates.map(name => `“${name}”`).join(', ')}`});
    }
    // If another site’s home page has the same domain:
    const domains = new Set(proposal.urls.map(url => getDomain(getHost(url))));
    const domainMates = [...new Set([...domains].flatMap(domain => sitesByDomain.get(domain) ?? []))]
    .filter(name => name !== proposal.site);
    if (domainMates.length) {
      proposal.flags.push({code: 'sharedDomain', detail: `Also: ${domainMates.map(name => `“${name}”`).join(', ')}`});
    }
  }
  // Sort the proposals by site name and then page name, with the home page first.
  return proposals.sort((a, b) => a.site.localeCompare(b.site)
  || Number(b.page === 'home') - Number(a.page === 'home')
  || a.page.localeCompare(b.page));
};
// Returns the page records derived from the reports in a directory, adding to existing records.
const addRecords = (
  recordMap: Map<string, PageRecord>, dir: string, isHidden: boolean, skipped: string[]
): number => {
  // If the directory does not exist, there are no reports in it.
  if (!fs.existsSync(dir)) {
    return 0;
  }
  const fileNames = fs.readdirSync(dir).filter(fileName => fileName.endsWith('.json'));
  // For each report file:
  for (const fileName of fileNames) {
    const reportID = fileName.slice(0, -5);
    let report: any;
    try {
      report = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8'));
    }
    catch {
      skipped.push(`${fileName} (unreadable or not JSON)`);
      continue;
    }
    const description = report?.target?.what;
    const url = report?.target?.url;
    // If the report has no description or URL:
    if (typeof description !== 'string' || !description || typeof url !== 'string' || !url) {
      skipped.push(`${fileName} (no target description or URL)`);
      continue;
    }
    // Add the report to the record of its description.
    const record = recordMap.get(description)
    ?? {description, urls: [], reportIDs: [], hiddenReportIDs: []};
    if (!record.urls.includes(url)) {
      record.urls.push(url);
    }
    (isHidden ? record.hiddenReportIDs : record.reportIDs).push(reportID);
    recordMap.set(description, record);
  }
  return fileNames.length;
};
// Returns the page records derived from the reports and hidden reports.
export const getPageRecords = (): {records: PageRecord[]; reportFileCount: number; hiddenReportFileCount: number; skipped: string[]} => {
  const recordMap = new Map<string, PageRecord>();
  const skipped: string[] = [];
  const reportFileCount = addRecords(recordMap, reportsPath(), false, skipped);
  const hiddenReportFileCount = addRecords(recordMap, hiddenReportsPath(), true, skipped);
  return {records: [...recordMap.values()], reportFileCount, hiddenReportFileCount, skipped};
};

// OPERATION

/* c8 ignore start */
// The command-line operation is exercised by running the script; its functions are tested separately.
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex > -1 && args[outputIndex + 1]
    ? path.resolve(args[outputIndex + 1]!)
    : path.join(path.dirname(reportsPath()), 'siteMapping.json');
  // If the mapping file exists and overwriting it was not requested:
  if (fs.existsSync(outputPath) && !args.includes('--force')) {
    console.error(`${outputPath} exists and may contain your edits. Use --force to overwrite it, or --output to write elsewhere.`);
    process.exit(1);
  }
  const {records, reportFileCount, hiddenReportFileCount, skipped} = getPageRecords();
  const proposals = proposeMapping(records);
  const flagged = proposals.filter(proposal => proposal.flags.length);
  const summary = {
    reportFiles: reportFileCount,
    hiddenReportFiles: hiddenReportFileCount,
    skippedFiles: skipped.length,
    pages: proposals.length,
    sites: new Set(proposals.map(proposal => proposal.site)).size,
    flaggedPages: flagged.length
  };
  const mapping = {
    generated: new Date().toISOString(),
    instructions: 'Review every page with flags, and edit the site and page of any page as needed, following the site-assignment rules in docs/decisions/011-site-page-ontology.md. Pages with the same site value will belong to the same site. Do not edit description, which identifies the pages to be migrated. A home page has the page name “home”.',
    summary,
    flagExplanations,
    skipped,
    pages: proposals
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`);
  // Report the results.
  console.log(`Wrote ${outputPath}. No report was modified.`);
  console.log(JSON.stringify(summary));
  for (const item of skipped) {
    console.log(`Skipped ${item}`);
  }
  for (const proposal of flagged) {
    console.log(`\n“${proposal.description}” → site “${proposal.site}”, page “${proposal.page}”`);
    for (const flag of proposal.flags) {
      console.log(`  ${flag.code}: ${flag.detail}`);
    }
  }
}
/* c8 ignore stop */
