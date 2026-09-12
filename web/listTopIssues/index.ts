/*
  index.ts
  Lists the most commonly reported issues in all available latest reports.
*/

// IMPORTS

import {sendAlert} from '../../alerts.ts';
import {
  getEngineNamesString,
  getReportExtracts,
  getReport,
  getWCAGLink,
  getWeightName,
  objectSort,
} from '../../util.ts';
import {issues as issueSpecs} from 'testaro-issues';
import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Gets summary data on the issues reported in a set of reports.
const getIssuesSummary = async () => {
  // Initialize the summary.
  const summary: Record<string, any> = {
    totalCount: 0,
    issues: []
  };
  // Initialize data for a summary.
  const issuesData: Record<string, any> = {};
  // Get extracts of the latest available report on each page.
  const latestReportExtracts = await getReportExtracts(true);
  // For each of them:
  for (const reportExtract of latestReportExtracts) {
    const {timeStamp, jobID} = reportExtract;
    // Get the corresponding report.
    const report = await getReport(timeStamp, jobID);
    const {acts = [], error} = report;
    // If this failed:
    if (error) {
      // Populate the summary with the reason.
      summary.error = error;
    }
    // For each act in it (none if the report retrieval failed):
    acts.forEach((act: any) => {
      // If it is a test act:
      if (act.type === 'test') {
        const {result, which} = act;
        const instances = result?.standardResult?.instances ?? [];
        // For each of its standard instances:
        instances.forEach((instance: any) => {
          const {count, issueID} = instance;
          // If the instance has a non-ignorable issue ID:
          if (issueID && issueID !== 'ignorable') {
            issuesData[issueID] ??= {
              count: 0,
              reporters: new Set()
            };
            // Increment the data with the count and reporter of the instance.
            issuesData[issueID].count += count ?? 1;
            issuesData[issueID].reporters.add(which);
          }
        });
      }
    });
  }
  // For each issue:
  Object.entries(issuesData).forEach(([issueID, data]) => {
    const {count, reporters} = data;
    // If the issue is still classified:
    if (issueSpecs[issueID]) {
      // Increment the report violation count by the issue violation count.
      summary.totalCount += count;
      // Add the issue data and an initilized percentage to the summary.
      summary.issues.push({
        issueID,
        weight: issueSpecs[issueID].weight,
        count,
        percentage: 0,
        reporters: getEngineNamesString(reporters)
      });
    }
    // Otherwise, i.e. if it is no longer classified:
    else {
      // Report this.
      console.log(`ERROR: Annotations obsolete for issue ${issueID}; reannotate`);
      // Notify a manager.
      sendAlert('Annotations obsolete', `Annotations for issue ${issueID} obsolete; reannotate.`);
    }
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
  // If this failed:
  if (issuesSummary.error) {
    // Populate the query with the reason.
    query.error = issuesSummary.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, initialize the lines.
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
        const issue = issueSpecs[issueID];
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
        lines.push(`${margin}    <ul class="nav">`);
        const linkText = 'What rules belong to this issue?';
        const label = `What rules belong to the <q>${summary}</q> issue?`;
        const href = `/listRules.html/${issueID}`;
        lines.push(
          `${margin}      <li><a href="${href}" aria-label="${label}">${linkText}</a></li>`
        );
        lines.push(`${margin}    </ul>`);
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
  // Otherwise, i.e. if the query does not report an error, get the template.
  let answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
