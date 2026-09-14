/*
  index.ts
  Lists the diagnoses of a violator of an issue in a report.
*/

// IMPORTS

import {
  getPageDataStrings,
  getReport,
  getTestActInstances,
  getTextFragmentHref,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isReportError,
  populateTemplate,
  ruleEngines
} from '../../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (
  issueID: string,
  timeStamp: string,
  jobID: string,
  catalogIndex: string,
  pathID: string | null,
  query: Record<string, any>
) => {
  // Get descriptions of the page facts.
  const pageDataStrings = await getPageDataStrings(timeStamp, jobID);
  // If this failed:
  if (pageDataStrings.error !== undefined) {
    // Populate the query with the reason.
    query.error = pageDataStrings.error;
    // Stop populating the query.
    return;
  }
  const {testInfo, url, urlLink, description} = pageDataStrings;
  // Otherwise, i.e. if it succeeded, get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (isReportError(report)) {
    // Populate the query with the reason.
    query.error = report.error;
    // Stop populating the query.
    return;
  }
  const {catalog} = report;
  // Otherwise, i.e. if it succeeded, get the catalog item of the specified violator.
  const catalogItem = catalog[catalogIndex];
  const boxID = catalogItem?.boxID;
  const startTag = catalogItem?.startTag;
  const tagName = catalogItem?.tagName;
  const text = catalogItem?.text;
  query.catalogIndex = catalogIndex;
  const lines: string[] = [];
  const margin = ' '.repeat(6);
  if (catalogIndex && catalogItem?.textLinkable) {
    const href = getTextFragmentHref(text as string, url);
    const label = `Take me to element ${catalogIndex} on the page (in a new tab)`;
    const link = `<a href="${href}" target="_blank" aria-label="${label}">Take me there</a>`;
    query.takeMeThere = `${margin}    <p>${link}</p>`;
  }
  else {
    query.takeMeThere = '';
  }
  // Add facts about the issue to the query.
  query.target = description;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  query.issue = issueSpecs[issueID]?.summary;
  // If adding the issue summary failed:
  if (!query.issue) {
    // Populate the query with the reason.
    query.error = 'Issue not found';
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, get the issue details.
  const issue = issueSpecs[issueID]!;
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
  query.tagName = tagName || 'HTML';
  if (text && !['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName as string)) {
    const textString = text.split('\n').join(' … ');
    query.text = `<q>${htmlSafe(textString)}</q>`;
  }
  else {
    query.text = '[not applicable]';
  }
  query.startTag = htmlSafe(startTag ?? '') || '[not obtained]';
  query.pathID = pathID || '[not obtained]';
  if (boxID) {
    const dims = boxID.split(':');
    query.box = `x = ${dims[0]}, y = ${dims[1]}, width = ${dims[2]}, height = ${dims[3]}`;
  }
  else {
    query.box = '[not obtained]';
  }
  // Initialize an array of diagnoses.
  const diagnoses: any[] = [];
  // For each violating standard instance that pertains to this combination of issue and violator:
  getTestActInstances(report, {violationsOnly: true, issueID, catalogIndex}).forEach(({act, instance}) => {
    const {ruleID, what} = instance;
    // Add lines for it to the array.
    diagnoses.push({
      engineID: act.which,
      ruleID,
      what
    });
  });
  // For each diagnosis:
  diagnoses.forEach(diagnosis => {
    const {engineID, ruleID, what} = diagnosis;
    // Add lines.
    lines.push(`${margin}<li>${htmlSafe(what)}`);
    // engineID is act.which, guaranteed by isUsableReport to be a key in ruleEngines.
    const [engineName, engineOrg] = ruleEngines[engineID]!;
    lines.push(`${margin}  <p>Rule engine: ${engineName} (${engineOrg})</p>`);
    if (ruleID !== what) {
      lines.push(`${margin}  <p>Rule: <code>${ruleID}</code></p>`);
    }
    lines.push(`${margin}</li>`);
  });
  // Add the lines to the query.
  query.diagnoses = lines.join('\n');
};
// Returns a page answering the diagnoses question.
export const answer = async (pageArgs: string, search: string) => {
  const [issueID, timeStamp, jobID, catalogIndex] = pageArgs.split('/') as [string, string, string, string];
  const params = new URLSearchParams(search);
  const pathID = params.get('pathID');
  const query: Record<string, any> = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, timeStamp, jobID, catalogIndex, pathID, query);
  // If this failed:
  if (query.error) {
    // Return why.
    return {
      status: 'error',
      message: query.error
    };
  }
  // Otherwise, if it succeeded and the report facts were obtained:
  if (query.testInfo) {
    // Get the populated template.
    const answerPage = await populateTemplate(import.meta.dirname, query);
    // Return the populated page.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, i.e. if the report facts were not obtained:
  // Report this.
  return {
    status: 'error',
    message: 'Report facts not obtained'
  };
};
