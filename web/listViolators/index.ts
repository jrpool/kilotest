/*
  index.ts
  Lists the violators of an issue in a report.
*/

// IMPORTS

import {
  getPageDataStrings,
  getPathID,
  getReport,
  getEngineNamesString,
  getTestActInstances,
  getTextFragmentHref,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isHidden,
  isReportError,
  makeBreakable,
  populateTemplate,
} from '../../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (
  issueID: string,
  timeStamp: string,
  jobID: string,
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
  // Otherwise, i.e. if it succeeded, add the issue summary to the query.
  query.issue = issueSpecs[issueID]?.summary;
  // If adding the issue summary failed:
  if (!query.issue) {
    // Populate the query with the reason.
    query.error = 'Issue not found';
    // Stop populating the query.
    return;
  }
  const {testInfo, url, urlLink, what} = pageDataStrings;
  // Add page facts to the query.
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  const issue = issueSpecs[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
  // Initialize those whose values depend on instance inspection.
  query.count = 0;
  query.reporters = new Set();
  let violators: any = {};
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (isReportError(report)) {
    // Populate the query with the reason.
    query.error = report.error;
    // Stop populating the query.
    return;
  }
  const {catalog} = report;
  // Otherwise, i.e. if it succeeded, for each standard instance of the issue:
  getTestActInstances(report, {issueID}).forEach(({act, instance}) => {
    const pathID = instance.pathID || '/html';
    const catalogIndex = String(instance.catalogIndex || '0');
    const tagName = catalog[catalogIndex]?.tagName
    ?? pathID.split('/').pop()!.replace(/\[.+$/, '').toUpperCase();
    violators[catalogIndex] ??= {
      pathID: getPathID(catalog, catalogIndex, pathID),
      tagName,
      text: catalog[catalogIndex]?.text ?? '',
      reporters: new Set()
    };
    // Ensure that the rule engine is in the sets of reporters of the violator and the issue.
    violators[catalogIndex].reporters.add(act.which);
    query.reporters.add(act.which);
  });
  // Populate the violator count.
  const violatorCount = Object.keys(violators).length;
  query.violatorCount = violatorCount === 1 ? '1 violator was' : `${violatorCount} violators were`;
  // For each violator:
  Object.values(violators).forEach((violatorData: any) => {
    // Convert the set of its reporters to a string.
    violatorData.reporters = getEngineNamesString(violatorData.reporters);
  });
  const reporterCount = query.reporters.size;
  query.reporterCount = reporterCount === 1 ? '1 rule engine' : `${reporterCount} rule engines`;
  // Convert the set of issue reporters to a string.
  query.reporters = getEngineNamesString(query.reporters);
  // Convert the violator data to an array.
  violators = Object.entries(violators).map((entry: [string, any]) => ({
    catalogIndex: entry[0],
    ...entry[1]
  }));
  // Sort the violators in XPath order.
  violators.sort((a: any, b: any) => a.pathID.localeCompare(b.pathID));
  // Initialize the lines.
  const lines: string[] = [];
  const margin = ' '.repeat(6);
  let takeMeAdviceNeeded = false;
  // For each violator:
  violators.forEach((violator: any, index: number) => {
    const {catalogIndex, pathID, reporters, tagName, text} = violator;
    // Add a heading to the lines.
    lines.push(`${margin}<li><h3>Element ${catalogIndex}</h3>`);
    lines.push(`${margin}  <ul class="pseudoTopLevel">`);
    // Add properties of the violator to the lines.
    if (pathID) {
      lines.push(`${margin}    <li>XPath: <code>${makeBreakable(pathID)}</code></li>`);
    }
    if (tagName) {
      lines.push(`${margin}    <li>Tag name: <code>${tagName}</code></li>`);
    }
    if (text && !['HTML', 'HEAD', 'BODY', 'MAIN', 'NOSCRIPT'].includes(tagName)) {
      const textString = text.split('\n').join(' … ');
      lines.push(`${margin}    <li>Text: <q>${htmlSafe(textString)}</q></li>`);
    }
    lines.push(`${margin}    <li>Reported by ${reporters}</li>`);
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}  <ul class="nav">`);
    if (catalogIndex) {
      const catalogItem = catalog[catalogIndex] || {};
      if (catalogItem.textLinkable) {
        takeMeAdviceNeeded = true;
        const href = getTextFragmentHref(catalogItem.text as string, url);
        const label = `Take me to element ${catalogIndex} on the page (in a new tab)`;
        const takeMeLink = `<a href="${href}" target="_blank" aria-label="${label}">Take me there</a>`;
        lines.push(`${margin}    <li>${takeMeLink}</li>`);
      }
    }
    const href
    = `/listDiagnoses.html/${issueID}/${timeStamp}/${jobID}/${catalogIndex}?pathID=${pathID}`;
    const questionString = 'What diagnoses were reported';
    const labelString = `${questionString} for violator ${index + 1}?`;
    lines.push(
      `${margin}    <li><a href="${href}" aria-label="${labelString}">${questionString}?</a></li>`
    );
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`);
  });
  // Add the lines to the query.
  query.violators = lines.join('\n');
  query.takeMeThere = '';
  // If any lines contain text-fragment links:
  if (takeMeAdviceNeeded) {
    // Include advice about them in the answer.
    query.takeMeThere = '<p><q>Take me there</q> links will open the page in a new tab and try to scroll to the element and highlight it. This does not always succeed. You can return here by closing the new tab.</p>';
  }
};
// Returns a page answering the violators question.
export const answer = async (pageArgs: string) => {
  const [issueID, timeStamp, jobID] = pageArgs.split('/');
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  const query: Record<string, any> = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, timeStamp, jobID, query);
  // If this failed:
  if (query.error) {
    // Return the error.
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
  // Otherwise, i.e. if the report facts were not obtained, report this.
  return {
    status: 'error',
    message: 'Report facts not obtained'
  };
};
