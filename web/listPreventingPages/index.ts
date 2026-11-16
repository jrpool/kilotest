/*
  index.ts
  Lists the pages that rule engines were prevented from testing, with the prevented rule engines and the reasons, according to the latest available report about each page. Uses only the report extracts, so no report is read.
*/

// IMPORTS

import {alphaCompare, getReportExtracts, htmlSafe, populateTemplate, ruleEngines} from '../../util.ts';
import {getPageTitle, getRegistry} from '../../registry.ts';
import {getAgoString} from '../util.ts';

// FUNCTIONS

// Returns a page listing the incompletely tested pages.
export const answer = async () => {
  const margin = ' '.repeat(6);
  const registry = await getRegistry();
  // Get the extracts of the latest reports in which any rule engine was prevented, with the
  // extended names (site name and page name) of their pages.
  const entries = (await getReportExtracts(true))
  .filter(extract => Object.keys(extract.preventions).length)
  .map(extract => ({extract, title: getPageTitle(registry, extract.pageID, extract.description)}));
  // Sort them by extended page name.
  entries.sort((a, b) => alphaCompare(a.title, b.title));
  const lines: string[] = [];
  // If there are any:
  if (entries.length) {
    lines.push(`${margin}<dl class="preventions">`);
    // For each of them:
    for (const {extract, title} of entries) {
      const {id, preventions, reportTime} = extract;
      const link = `<a href="/listIssues.html/${id}">${htmlSafe(title)}</a>`;
      // Add a term linking to the issues in the report.
      lines.push(`${margin}  <dt>${link} (tested ${getAgoString(new Date(reportTime))} ago)</dt>`);
      // Get the names of the prevented rule engines and the reasons, ordered by name.
      const failures = Object
      .entries(preventions)
      .map(([ruleEngineID, reason]) => [ruleEngines[ruleEngineID]?.[0] || ruleEngineID, reason] as const)
      .sort((a, b) => alphaCompare(a[0], b[0]));
      // Add a description for each of them.
      for (const [name, reason] of failures) {
        lines.push(`${margin}  <dd><span class="engine">${htmlSafe(name)}</span>: ${htmlSafe(reason) || 'no reason given'}</dd>`);
      }
    }
    lines.push(`${margin}</dl>`);
  }
  // Otherwise, i.e. if there are none:
  else {
    lines.push(`${margin}<p>No rule engines were prevented in the latest report of any page.</p>`);
  }
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {preventions: lines.join('\n')})
  };
};
