/*
  util.ts
  Utility functions.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {
  alphaCompare,
  getAgoDays,
  getDateString,
  getReportEndTime,
  getReportExtracts,
  getTestActInstances,
  getTestActs,
  htmlSafe,
  ruleEngines
} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';
import type {Catalog} from 'testaro';
import type {ReportExtract, UsableReport} from '../util.ts';
/* c8 ignore stop */
import wcagMap from '../wcagMap.json' with {type: 'json'};

// TYPES

// Page data from an available report.
export type PageData = {
  description: string;
  url: string;
  daysAgo: number | null;
  error?: never;
};
// HTML strings describing the page data of an available report.
export type PageDataStrings = {
  description: string;
  url: string;
  urlLink: string;
  testInfo: string;
  error?: never;
};
// Counts summarizing the results of an available report.
export type ResultsSummary = {
  engineCount: number;
  testedEngineCount: number;
  reporterCount: number;
  violationCount: number;
  violatorCount: number;
  issueCount: number;
};
// Basics about an available report.
export type ReportData = {
  description: string;
  url: string;
  jobName: unknown;
  issueCount: number;
  engineNames: string[];
  engineCount: number;
  testedEngineCount: number;
  reporterNames: string[];
  reporterCount: number;
  violationCount: number;
  violatorCount: number;
  preventedEngineNames: string[];
  preventedEngineCount: number;
  error?: never;
};

// FUNCTIONS

// Sorts strings alphabetically and case-insensitively.
const alphaSort = (strings: string[]) => strings.sort((a, b) => alphaCompare(a, b));
// Returns whether a comment's raw length is within the 20-to-1000-character bounds.
export const checkCommentLength = (
  content: string
): {status: 'ok'} | {status: 'error'; message: string} => {
  const contentLength = content.length;
  // If the length is invalid:
  if (contentLength < 20 || contentLength > 1000) {
    // Return the applicable error message.
    const messageSpec = contentLength < 20 ? 'shorter than 20' : 'longer than 1000';
    return {
      status: 'error',
      message: `Your comment was ${messageSpec} characters`
    };
  }
  return {status: 'ok'};
};
// Returns a string encoded for use as a URL fragment.
const fragmentEncode = (string: string) => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Returns a string describing the time in days since a time stamp or date.
export const getAgoString = (timeArg: string | Date): string => {
  const agoDays = getAgoDays(timeArg);
  if (agoDays === null) {
    return 'an unknown number of days';
  }
  return agoDays === 1 ? '1 day' : `${agoDays} days`;
};
// Returns a string describing a count.
export const getCountString = (count: number, singular: string, plural: string): string => count === 1 ? `1 ${singular}` : `${count} ${plural}`;
// Returns a time string from a time stamp.
const getTimeString = (timeStamp: string) => {
  const timeString = `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
  // Return the time string if valid, or null if not.
  return (!isNaN(Date.parse(`2000-01-01T${timeString}Z`))) ? timeString : null;
};
// Returns a date-and-time string from a time stamp or date.
export const getDateTimeString = (timeArg: string | Date): string => {
  let timeStamp: string;
  // If the argument is a date:
  if (timeArg instanceof Date) {
    // Convert it to a time stamp, or to an invalid one if the date is invalid.
    timeStamp = isNaN(timeArg.getTime())
      ? ''
      : timeArg.toISOString().slice(2, 16).replace(/[-:]/g, '');
  }
  // Otherwise, i.e. if it is a time stamp:
  else {
    timeStamp = timeArg;
  }
  const dateString = getDateString(timeStamp) || 'an unknown date';
  const timeString = getTimeString(timeStamp) || 'an unknown time';
  const dateTimeString = `${dateString} at ${timeString}`;
  return dateTimeString;
}
// Converts a catalog item text to a text-fragment link destination.
export const getTextFragmentHref = (text: string, url: string): string => {
  const fragmentList = text
  .split('\n')
  .map(fragment => fragmentEncode(fragment))
  .join(',');
  // Return a text-fragment link.
  return `${url}#:~:text=${fragmentList}`;
};
// Returns a +-delimited list of sorted names of rule engines.
export const getEngineNamesString = (engineIDSet: Iterable<string>): string => alphaSort(
  Array.from(engineIDSet).map(engineID => ruleEngines[engineID]?.[0] || engineID)
).join(' + ');
// Gets the WCAG Understanding link for a numeric WCAG standard identifier.
export const getWCAGLink = (numericID: string): string => {
  // Return the link.
  return `https://www.w3.org/WAI/WCAG22/Understanding/${(wcagMap as Record<string, string>)[numericID]}`;
};
// Gets the name of an issue weight.
export const getWeightName = (weight: number): string => ['lowest', 'low', 'high', 'highest'][weight - 1] ?? 'unknown';
// Makes a string breakable before non-initial slashes.
export const makeBreakable = (string: string): string => string.replace(/\//g, '<wbr>/').replace(/^<wbr>/, '');
// Returns the path ID of the element of a standard instance.
export const getPathID = (catalog: Catalog, catalogIndex: string, pathID?: string) => {
  if (catalogIndex) {
    const pathIDFromCatalog = (catalog[catalogIndex] || {}).pathID;
    if (pathIDFromCatalog) {
      return pathIDFromCatalog;
    }
  }
  return pathID ?? '/html';
};
// Identifies the rule engines called and the rule engines prevented from testing, by a report.
// Prevented engines have test acts. The nuVal and nuVnu engines are 2 implementations of one
// engine, so they count as one. A nuVal prevention is ignored if nuVnu then ran successfully.
export const getEngineIDs = (report: any) => {
  const preventions = report.jobData?.preventions ?? {};
  const calledIDs = new Set<string>([
    ...getTestActs(report).map((act: any) => act.which as string),
    ...Object.keys(preventions)
  ]);
  const preventedIDs = new Set<string>(Object.keys(preventions));
  // If both implementations were called:
  if (calledIDs.has('nuVal') && calledIDs.has('nuVnu')) {
    // Count them as one engine.
    calledIDs.delete('nuVnu');
    // If nuVnu was not prevented from testing:
    if (!preventedIDs.has('nuVnu')) {
      // Ignore any nuVal prevention.
      preventedIDs.delete('nuVal');
    }
    // Otherwise, i.e. if nuVnu was prevented, count both preventions as one.
    else {
      preventedIDs.delete('nuVnu');
    }
  }
  return {calledIDs: Array.from(calledIDs), preventedIDs: Array.from(preventedIDs)};
};
// Returns basics about an available report.
export const getReportData = (report: UsableReport): ReportData => {
  // Initialize the data.
  const data = {
    description: report.target.what,
    url: report.target.url,
    jobName: report.id,
    issueCount: 0,
    engineNames: [] as string[],
    engineCount: 0,
    testedEngineCount: 0,
    reporterNames: [] as string[],
    reporterCount: 0,
    violationCount: 0,
    violatorCount: 0,
    preventedEngineNames: [] as string[],
    preventedEngineCount: 0
  };
  const issueIDSet = new Set<string>();
  const reporterIDSet = new Set<string>();
  const violatorIndexSet = new Set<string>();
  const {calledIDs, preventedIDs} = getEngineIDs(report);
  // For each violating standard instance of each test act:
  getTestActInstances(report, {violationsOnly: true}).forEach(({act, instance}) => {
    const {catalogIndex, issueID} = instance;
    // If it has a non-ignorable classified issue ID:
    if (issueID && issueSpecs[issueID] && issueID !== 'ignorable') {
      // Ensure that the rule engine is in the temporary data.
      reporterIDSet.add(act.which!);
      // Ensure that the issue is in the temporary data.
      issueIDSet.add(issueID);
      // Increment the violation count.
      data.violationCount++;
      // If the violator has a catalog index:
      if (catalogIndex) {
        // Ensure that the violator is in the temporary data.
        violatorIndexSet.add(String(catalogIndex));
      }
    }
  });
  // Populate the data with the act data.
  data.issueCount = issueIDSet.size;
  data.engineNames = Array
  .from(calledIDs)
  .map(id => ruleEngines[id]?.[0] || id)
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.engineCount = calledIDs.length;
  data.testedEngineCount = calledIDs.length - preventedIDs.length;
  data.reporterNames = Array
  .from(reporterIDSet)
  .map(id => ruleEngines[id]![0])
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.reporterCount = data.reporterNames.length;
  data.violatorCount = violatorIndexSet.size;
  // Add the names of any prevented rule engines to the data.
  data.preventedEngineNames = preventedIDs
  .map(engineID => ruleEngines[engineID]?.[0] || engineID)
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.preventedEngineCount = data.preventedEngineNames.length;
  // Return the data.
  return data;
}
// Returns page data from an available report.
export const getPageData = (report: UsableReport): PageData => {
  const {what: description, url} = report.target;
  // Get the elapsed time in days since the report was completed.
  const daysAgo = getAgoDays(getReportEndTime(report));
  // Return the data.
  return {
    description,
    url,
    daysAgo
  };
};
// Gets HTML strings for page data from a report.
export const getPageDataStrings = (report: UsableReport): PageDataStrings => {
  const {daysAgo, url, description} = getPageData(report);
  // Get a description of the completion time of the report.
  const when = getDateTimeString(getReportEndTime(report));
  // Return the HTML strings.
  return {
    description,
    url,
    urlLink: `<a href="${url}">${url}</a>`,
    testInfo: `Tested ${daysAgo === 1 ? '1 day' : `${daysAgo} days`} ago on ${when} by job <code>${report.id}</code>`
  };
};
// Returns the lines of a list of facts about the page of an available report.
export const getPageFactsLines = (
  strings: PageDataStrings,
  summary: ResultsSummary,
  margin: string
): string[] => [
  `${margin}<ul>`,
  `${margin}  <li>URL: ${strings.urlLink}</li>`,
  `${margin}  <li>${strings.testInfo}</li>`,
  `${margin}  <li>Summary of results:`,
  `${margin}    <ul>`,
  `${margin}      <li>Rule engines:`,
  `${margin}        <ul>`,
  `${margin}          <li>Called: ${summary.engineCount}</li>`,
  `${margin}          <li>Were able to test: ${summary.testedEngineCount}</li>`,
  `${margin}          <li>Reported any rule violations: ${summary.reporterCount}</li>`,
  `${margin}        </ul>`,
  `${margin}      </li>`,
  `${margin}      <li>Violations: ${summary.violationCount}</li>`,
  `${margin}      <li>Violators: ${summary.violatorCount}</li>`,
  `${margin}      <li>Issues: ${summary.issueCount}</li>`,
  `${margin}    </ul>`,
  `${margin}  </li>`,
  `${margin}</ul>`
];
// Returns the lines of a list of facts about an issue in an available report.
export const getIssueFactsLines = (
  report: UsableReport,
  issueID: string,
  margin: string,
  listClass?: string
): string[] => {
  // Get the issue classification.
  const {wcag, weight, why} = issueSpecs[issueID]!;
  // Initialize the issue counts.
  const reporters = new Set<string>();
  const violatorIndexes = new Set<string>();
  let violationCount = 0;
  // For each violating standard instance of the issue:
  getTestActInstances(report, {violationsOnly: true, issueID}).forEach(({act, instance}) => {
    // Increment the counts.
    violationCount++;
    reporters.add(act.which!);
    violatorIndexes.add(String(instance.catalogIndex || '0'));
  });
  const reporterString = getCountString(reporters.size, 'rule engine', 'rule engines');
  // Return the lines.
  return [
    `${margin}<ul${listClass ? ` class="${listClass}"` : ''}>`,
    `${margin}  <li>Why it matters: ${why}</li>`,
    `${margin}  <li>Priority: ${getWeightName(weight)}</li>`,
    `${margin}  <li>Related WCAG standard: <a href="${getWCAGLink(wcag)}">${wcag}</a></li>`,
    `${margin}  <li>Reported by ${reporterString} (${getEngineNamesString(reporters)})</li>`,
    `${margin}  <li>Violations: ${violationCount}</li>`,
    `${margin}  <li>Violators: ${violatorIndexes.size}</li>`,
    `${margin}</ul>`
  ];
};
// Returns the lines of a list of facts about a violator of an issue in an available report.
export const getViolatorFactsLines = (
  report: UsableReport,
  issueID: string,
  catalogIndex: string,
  pathID: string | null,
  margin: string,
  listClass?: string
): string[] => {
  const {catalog} = report;
  const catalogItem = catalog[catalogIndex];
  const boxID = catalogItem?.boxID;
  const startTag = catalogItem?.startTag;
  const tagName = catalogItem?.tagName;
  const text = catalogItem?.text;
  // Identify the rule engines that reported the violator for the issue.
  const reporters = new Set<string>();
  getTestActInstances(report, {violationsOnly: true, issueID, catalogIndex}).forEach(({act}) => {
    reporters.add(act.which!);
  });
  const lines: string[] = [
    `${margin}<ul${listClass ? ` class="${listClass}"` : ''}>`,
    `${margin}  <li>Tag name: <code>${tagName || 'HTML'}</code></li>`
  ];
  // Text is not applicable for container elements.
  if (text && !['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName as string)) {
    const textString = text.split('\n').join(' … ');
    lines.push(`${margin}  <li>Text: <q>${htmlSafe(textString)}</q></li>`);
  }
  else {
    lines.push(`${margin}  <li>Text: [not applicable]</li>`);
  }
  lines.push(`${margin}  <li>Start tag: <code>${htmlSafe(startTag ?? '') || '[not obtained]'}</code></li>`);
  lines.push(`${margin}  <li>XPath: <code>${makeBreakable(pathID || '[not obtained]')}</code></li>`);
  // If the catalog item has a bounding box, add its dimensions.
  if (boxID) {
    const dims = boxID.split(':');
    lines.push(`${margin}  <li>Bounding box: x = ${dims[0]}, y = ${dims[1]}, width = ${dims[2]}, height = ${dims[3]}</li>`);
  }
  else {
    lines.push(`${margin}  <li>Bounding box: [not obtained]</li>`);
  }
  lines.push(`${margin}  <li>Reported by ${getEngineNamesString(reporters)}</li>`);
  lines.push(`${margin}</ul>`);
  return lines;
};
// Gets the descriptions of multi-report pages, from extracts already obtained, if provided.
export const getMultiReportWhats = async (
  reportExtracts?: ReportExtract[]
): Promise<string[]> => {
  reportExtracts ??= await getReportExtracts();
  const sortedDescriptions = reportExtracts.map(extract => extract.description).sort();
  const multiReportDescriptions = sortedDescriptions.filter(
    (description, index) => description !== sortedDescriptions[index - 1] && description === sortedDescriptions[index + 1]
  );
  return multiReportDescriptions;
};
