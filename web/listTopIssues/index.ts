/*
  index.ts
  Lists the most commonly reported issues in all available latest reports.
*/

// IMPORTS

import {
  getRuleKeyIssue,
  getViolationData,
  objectSort,
  populateTemplate,
  reannotationNeededMessage
} from '../../util.ts';
import {
  getEngineNamesString,
  getWCAGLink,
  getWeightName
} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// FUNCTIONS

// Gets summary data on the issues reported in a set of reports.
const getIssuesSummary = async () => {
  // Initialize the summary.
  const summary: Record<string, any> = {
    totalCount: 0,
    issues: []
  };
  // Initialize data for a summary.
  const issuesData: Record<string, {count: number; reporters: Set<string>}> = {};
  // Get the violation data of the latest available report on each page.
  const violationData = await getViolationData();
  // If this failed:
  if ('error' in violationData) {
    // Populate the summary with the reason and stop.
    summary.error = violationData.error;
    return summary;
  }
  // For each rule of each rule engine reported in any of the reports:
  for (const {violations} of violationData) {
    for (const [engineID, engineViolations] of Object.entries(violations)) {
      for (const [ruleKey, {failed}] of Object.entries(engineViolations)) {
        const issueID = getRuleKeyIssue(engineID, ruleKey);
        // If the rule was violated and belongs to a non-ignorable issue:
        if (failed.count && issueID && issueID !== 'ignorable') {
          // Increment the data on the issue with the count and reporter of the violations.
          issuesData[issueID] ??= {count: 0, reporters: new Set()};
          issuesData[issueID].count += failed.count;
          issuesData[issueID].reporters.add(engineID);
        }
      }
    }
  }
  // For each issue:
  Object.entries(issuesData).forEach(([issueID, {count, reporters}]) => {
    // Increment the report violation count by the issue violation count.
    summary.totalCount += count;
    // Add the issue data and an initilized percentage to the summary.
    summary.issues.push({
      issueID,
      weight: issueSpecs[issueID]!.weight,
      count,
      percentage: 0,
      reporters: getEngineNamesString(reporters)
    });
  });
  // For each summarized issue:
  summary.issues.forEach((issue: any) => {
    // Add its percentage to its entry.
    issue.percentage = Math.round(100 * (issue.count / summary.totalCount));
  });
  // Sort the issues in descending count order.
  objectSort(summary.issues, 'count', 'numericDown');
  // Sort the issues in descending priority order.
  objectSort(summary.issues, 'weight', 'numericDown');
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (query: Record<string, any>) => {
  // Get summary data on the issues.
  const issuesSummary = await getIssuesSummary();
  // If the data are unavailable until reports are reannotated:
  if (issuesSummary.error === reannotationNeededMessage) {
    // Populate the query with a statement of this, which correctly answers the question.
    query.intro = `${reannotationNeededMessage}.`;
    query.issues = '';
    return;
  }
  // Otherwise, if this failed:
  if (issuesSummary.error) {
    // Populate the query with the reason.
    query.error = issuesSummary.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, initialize the lines.
  query.intro = 'These are the issues reported most often. If a page has been tested more than once, only its last test is counted.';
  const lines: string[] = [];
  const margin = ' '.repeat(6);
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Add a heading to the lines.
    lines.push(`${margin}<h2>${getWeightName(weight)} priority</h2>`);
    const reportedIssues = issuesSummary.issues;
    lines.push(`${margin}<ul>`);
    let existsIssue = false;
    // For each reported issue:
    reportedIssues.forEach((reportedIssue: any) => {
      const {issueID, percentage, reporters} = reportedIssue;
      // If it has the weight and its percentage is at least 2:
      if (reportedIssue.weight === weight && percentage >= 2) {
        existsIssue = true;
        // Get the data on it from the issue classification.
        const issue = issueSpecs[issueID]!;
        const {summary, wcag, why} = issue;
        const wcagLink = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
        // Add a description of it to the lines.
        lines.push(`${margin}  <li>${summary}`);
        lines.push(`${margin}    <ul>`);
        lines.push(`${margin}      <li>Why it matters: ${why}`);
        lines.push(`${margin}      <li>Related WCAG standard: ${wcagLink}`);
        lines.push(`${margin}      <li>Share of violations: ${percentage}%</li>`);
        lines.push(`${margin}      <li>Violations reported by ${reporters}</li>`);
        lines.push(`${margin}    </ul>`);
        const linkText = 'What rules belong to this issue?';
        const label = `What rules belong to the <q>${summary}</q> issue?`;
        const href = `/listRules.html/${issueID}`;
        lines.push(
          `${margin}    <p class="links"><a href="${href}" aria-label="${label}">${linkText}</a></p>`
        );
        lines.push(`${margin}  </li>`);
      }
    });
    lines.push(`${margin}</ul>`);
    if (!existsIssue) {
      lines.push(`${margin}<p>No issues with this priority.</p>`);
    }
  });
  // Add the lines to the query.
  query.issues = lines.join('\n');
};
// Returns a page answering the issues question.
export const answer = async () => {
  const query: Record<string, any> = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // If the query reports an error:
  if (query.error) {
    // Return why.
    return {
      status: 'error',
      message: query.error
    };
  }
  // Otherwise, i.e. if the query does not report an error, get the populated template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
