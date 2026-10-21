/*
  index.ts
  Lists the diagnoses of a violator of an issue in a report.
*/

// IMPORTS

import {
  getReport,
  getTestActInstances,
  htmlSafe,
  isReportError,
  populateTemplate,
  ruleEngines
} from '../../util.ts';
import {
  getIssueFactsLines,
  getPageDataStrings,
  getPageFactsLines,
  getReportData,
  getTextFragmentHref,
  getViolatorFactsLines
} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (
  issueID: string,
  reportID: string,
  catalogIndex: string,
  query: Record<string, any>
) => {
  // Get the report.
  const report = await getReport(reportID);
  // If this failed:
  if (isReportError(report)) {
    // Populate the query with the reason.
    query.error = report.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, get descriptions of the page facts.
  const pageDataStrings = getPageDataStrings(report);
  // If this failed:
  if (pageDataStrings.error !== undefined) {
    // Populate the query with the reason.
    query.error = pageDataStrings.error;
    // Stop populating the query.
    return;
  }
  const {testInfo, url, description} = pageDataStrings;
  const {catalog} = report;
  query.catalogIndex = catalogIndex;
  const lines: string[] = [];
  const margin = ' '.repeat(6);
  const catalogItem = catalog[catalogIndex];
  // If the violator has a linkable text item, add a take-me-there link.
  if (catalogIndex && catalogItem?.textLinkable) {
    const href = getTextFragmentHref(catalogItem.text as string, url);
    const label = `Take me there (to element ${catalogIndex})`;
    const link = `<a href="${href}" aria-label="${label}">Take me there</a>`;
    query.takeMeThere = `${margin}<p class="links">${link}</p>`;
  }
  else {
    query.takeMeThere = '';
  }
  // Add facts about the page to the query.
  query.target = description;
  query.testInfo = testInfo;
  query.pageFacts = getPageFactsLines(pageDataStrings, getReportData(report), margin).join('\n');
  query.issue = issueSpecs[issueID]?.summary;
  // If adding the issue summary failed:
  if (!query.issue) {
    // Populate the query with the reason.
    query.error = 'Issue not found';
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, add the issue-facts and violator-facts lists to the query.
  query.issueFacts = getIssueFactsLines(report, issueID, margin).join('\n');
  query.violatorFacts = getViolatorFactsLines(report, issueID, catalogIndex, margin).join('\n');
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
export const answer = async (pageArgs: string) => {
  const [issueID, reportID, catalogIndex] = pageArgs.split('/') as [string, string, string];
  const query: Record<string, any> = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, reportID, catalogIndex, query);
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
