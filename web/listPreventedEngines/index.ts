/*
  index.ts
  Lists the rule engines that were prevented from testing pages, with the pages that they were prevented from testing and the reasons, according to the latest available report about each page. Uses only the report extracts, so no report is read.
*/

// IMPORTS

import {alphaCompare, getReportExtracts, htmlSafe, populateTemplate, ruleEngines} from '../../util.ts';
import {getPageTitle, getRegistry} from '../../registry.ts';
import {getAgoString} from '../util.ts';

// TYPES

// A prevention of a rule engine from testing a page.
type Prevention = {
  reportID: string;
  title: string;
  reportTime: string;
  reason: string;
};

// FUNCTIONS

// Returns a page listing the rule engines that were prevented from testing pages.
export const answer = async () => {
  const margin = ' '.repeat(6);
  const registry = await getRegistry();
  // Initialize the preventions, by rule-engine name.
  const enginePreventions = new Map<string, Prevention[]>();
  // For each latest report:
  for (const extract of await getReportExtracts(true)) {
    const {id, pageID, description, preventions, reportTime} = extract;
    // Get the extended name (site name and page name) of its page.
    const title = getPageTitle(registry, pageID, description);
    // For each rule engine prevented in it:
    for (const [ruleEngineID, reason] of Object.entries(preventions)) {
      const name = ruleEngines[ruleEngineID]?.[0] || ruleEngineID;
      // Add the prevention to the preventions of the rule engine.
      const preventionList = enginePreventions.get(name) ?? [];
      preventionList.push({reportID: id, title, reportTime, reason});
      enginePreventions.set(name, preventionList);
    }
  }
  const lines: string[] = [];
  // If any rule engine was prevented:
  if (enginePreventions.size) {
    lines.push(`${margin}<dl class="preventions">`);
    // For each prevented rule engine, in name order:
    for (const name of Array.from(enginePreventions.keys()).sort(alphaCompare)) {
      // Add a term naming it.
      lines.push(`${margin}  <dt class="engine">${htmlSafe(name)}</dt>`);
      // Sort the pages that it was prevented from testing by extended page name.
      const preventionList = enginePreventions.get(name)!.sort((a, b) => alphaCompare(a.title, b.title));
      // For each of them:
      for (const {reportID, title, reportTime, reason} of preventionList) {
        const link = `<a href="/listIssues.html/${reportID}">${htmlSafe(title)}</a>`;
        const ago = `(tested ${getAgoString(new Date(reportTime))} ago)`;
        // Add a description linking to the issues in the report and giving the reason.
        lines.push(`${margin}  <dd>${link} ${ago}: ${htmlSafe(reason) || 'no reason given'}</dd>`);
      }
    }
    lines.push(`${margin}</dl>`);
  }
  // Otherwise, i.e. if none was:
  else {
    lines.push(`${margin}<p>No rule engines were prevented in the latest report of any page.</p>`);
  }
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, {preventions: lines.join('\n')})
  };
};
