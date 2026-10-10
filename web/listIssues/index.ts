/*
  index.ts
  List the issues in a report.
*/

// IMPORTS

import {
  getPageReportExtracts,
  getReport,
  getTestActInstances,
  isReportError,
  objectSort,
  populateTemplate
} from '../../util.ts';
import type {UsableReport} from '../../util.ts';
import {
  getAgoString,
  getIssueFactsLines,
  getPageDataStrings,
  getPageFactsLines,
  getEngineIDs,
  getEngineNamesString,
  getWeightName
} from '../util.ts';
import type {ResultsSummary} from '../util.ts';
import {issues as issueSpecs} from 'testaro-issues';

// FUNCTIONS

// Returns data on the issues reported by a report.
const getIssuesData = (report: UsableReport): ResultsSummary & Record<string, any> => {
  // Initialize the temporary data.
  const temp = {
    issues: {} as Record<string, any>,
    reporters: new Set<string>(),
    violators: new Set<string>()
  };
  // Initialize the final data.
  const final: ResultsSummary & Record<string, any> = {
    reporters: [],
    reporterList: '',
    reporterCount: 0,
    engineCount: 0,
    testedEngineCount: 0,
    violationCount: 0,
    violatorCount: 0,
    issues: {
      4: [],
      3: [],
      2: [],
      1: []
    },
    issueCount: 0
  };
  // For each violating standard instance of each test act:
  getTestActInstances(report, {violationsOnly: true}).forEach(({act, instance}) => {
    const {catalogIndex, issueID} = instance;
    const which = act.which!;
    // If it identifies a non-ignorable issue:
    if (issueID && issueID !== 'ignorable') {
      const issueClassification = issueSpecs[issueID];
      // If the issue has a current weighted classification:
      if (issueClassification && [1, 2, 3, 4].includes(issueClassification.weight)) {
        const {summary, wcag, weight, why} = issueClassification;
        // Initialize the temporary data on the issue if necessary.
        temp.issues[issueID] ??= {
          issueID,
          summary,
          wcag,
          why,
          weight,
          reporters: new Set(),
          reporterList: '',
          violationCount: 0,
          violators: new Set()
        };
        // Ensure the rule engine is in the temporary data.
        temp.issues[issueID].reporters.add(which);
        temp.reporters.add(which);
        // Increment the violation counts.
        temp.issues[issueID].violationCount++;
        final.violationCount++;
        // If the instance has a catalog index:
        if (catalogIndex) {
          // Ensure the violator is in the temporary data.
          temp.issues[issueID].violators.add(catalogIndex);
          temp.violators.add(String(catalogIndex));
        }
      }
    }
  });
  // Finish populating the final data.
  const {calledIDs, preventedIDs} = getEngineIDs(report);
  final.engineCount = calledIDs.length;
  final.testedEngineCount = calledIDs.length - preventedIDs.length;
  final.reporterList = getEngineNamesString(temp.reporters);
  final.reporterCount = temp.reporters.size;
  final.violatorCount = temp.violators.size;
  Object.values(temp.issues).forEach(issue => {
    const {issueID, summary, wcag, why, weight} = issue;
    const finalIssue: Record<string, any> = {
      issueID,
      summary,
      wcag,
      why,
      weight
    };
    finalIssue.reporterList = getEngineNamesString(issue.reporters);
    finalIssue.reporterCount = issue.reporters.size;
    finalIssue.violationCount = issue.violationCount;
    finalIssue.violatorCount = issue.violators.size;
    final.issues[issue.weight].push(finalIssue);
  });
  final.issueCount = Object.keys(temp.issues).length;
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    // Sort its issues in the final data alphabetically by reporter names.
    objectSort(final.issues[weight], 'reporterList', 'alpha');
    // Sort the issues again in descending reporter-count order, making this the primary order.
    objectSort(final.issues[weight], 'reporterCount', 'numericDown');
  });
  // Return the data.
  return final;
};
// Returns the lines of the history of the reports about the page of a report.
const getHistoryLines = async (
  timeStamp: string, jobID: string, description: string, margin: string
): Promise<string[]> => {
  // Get extracts of all reports about the page, from oldest to latest.
  const pageExtracts = await getPageReportExtracts(description);
  const lastIndex = pageExtracts.length - 1;
  // Initialize the list items and whether the report is the latest about the page.
  const itemLines: string[] = [];
  let isLatest = false;
  // For each report about the page:
  pageExtracts.forEach((extract, index) => {
    const isThis = extract.timeStamp === timeStamp && extract.jobID === jobID;
    isLatest ||= isThis && index === lastIndex;
    // Get the tags that identify its position and whether it is this report.
    const tags = [
      index === 0 ? 'oldest' : '',
      index === lastIndex ? 'latest' : '',
      isThis ? 'this report' : ''
    ]
    .filter(tag => tag);
    const tagString = tags.length ? ` (${tags.join('; ')})` : '';
    const label = `${getAgoString(new Date(extract.reportTime))} ago${tagString}`;
    // Add a list item describing it, linked unless it is this report, to the items.
    const href = `/listIssues.html/${extract.timeStamp}/${extract.jobID}`;
    const content = isThis ? label : `<a href="${href}">${label}</a>`;
    itemLines.push(`${margin}  <li>${content}</li>`);
  });
  // Initialize the lines with a list of the reports, or a statement that there is only one.
  const lines = itemLines.length > 1
  ? [`${margin}<ol>`, ...itemLines, `${margin}</ol>`]
  : [`${margin}<p>This is the only report about the page.</p>`];
  // If the report is the latest about the page:
  if (isLatest) {
    // Add a link to the form for requesting a retest to the lines.
    const href = `/requestRetestForm.html/${timeStamp}/${jobID}`;
    lines.push(`${margin}<p><a href="${href}">Should Kilotest retest the page?</a></p>`);
  }
  // Return the lines.
  return lines;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (timeStamp: string, jobID: string, query: Record<string, any>) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (isReportError(report)) {
    // Populate the query with the reason.
    query.error = report.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, get fact descriptions for the target.
  const pageInfo = getPageDataStrings(report);
  // If this failed:
  if (pageInfo.error !== undefined) {
    // Populate the query with the reason.
    query.error = pageInfo.error;
    // Stop populating the query.
    return;
  }
  // Otherwise, i.e. if it succeeded, get data on the issues.
  const issuesData = getIssuesData(report);
  const {testInfo, description} = pageInfo;
  // Add target data to the query.
  query.target = description;
  query.testInfo = testInfo;
  const margin = ' '.repeat(6);
  // Add the page-facts list to the query.
  query.pageFacts = getPageFactsLines(pageInfo, issuesData, margin).join('\n');
  // Add the history of reports about the page to the query.
  query.history = (await getHistoryLines(timeStamp, jobID, description, margin)).join('\n');
  const {issues} = issuesData;
  // Add a summary of the issues to the query.
  query.highestCount = issues[4].length;
  query.highCount = issues[3].length;
  query.lowCount = issues[2].length;
  query.lowestCount = issues[1].length;
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const weightName = getWeightName(weight);
    const weightIssues = issues[weight];
    // If any reported issues have the weight:
    if (weightIssues.length) {
      // Initialize lines for the weight details query property.
      const detailsLines: string[] = [];
      // For each issue with the weight:
      weightIssues.forEach((issueData: any) => {
        const weightIssueCount = weightIssues.length;
        // Add the issue count to the query.
        query[`${weightName}Count`] = weightIssueCount;
        const {issueID, summary} = issueData;
        // Add the start of a list item to the lines.
        detailsLines.push(`${margin}  <li>`);
        // Add a heading summarizing the issue to the lines.
        detailsLines.push(`${margin}    <h5>${summary}</h5>`);
        // Add the issue facts to the lines.
        detailsLines.push(
          ...getIssueFactsLines(report, issueID, `${margin}    `, 'pseudoTopLevel')
        );
        // Add the start of a link list to the lines.
        detailsLines.push(`${margin}    <ul class="nav">`);
        const whereQuestionString = 'Where was the issue found?';
        const labelString = `Where was the ${summary} issue found on the ${description} page?`;
        const href = `href="/listViolators.html/${issueID}/${timeStamp}/${jobID}"`;
        const label = `aria-label="${labelString}"`;
        const whereLink = `<a ${href} ${label}>${whereQuestionString}</a>`;
        // Add a violations link to the lines.
        detailsLines.push(`${margin}      <li>${whereLink}</li>`);
        // Add the end of the link list to the lines.
        detailsLines.push(`${margin}    </ul>`);
        // Add the end of the list item to the lines.
        detailsLines.push(`${margin}  </li>`);
      });
      // Add the weight details lines to the query.
      query[`${weightName}Details`] = detailsLines.join('\n');
    }
    // Otherwise, i.e. if no reported issues have the weight:
    else {
      query[`${weightName}Details`] = `${margin}  <li>None</li>`;
    }
  });
};
// Returns a page answering the target-issues question.
export const answer = async (pageArgs: string) => {
  const [timeStamp, jobID] = pageArgs.split('/') as [string, string];
  const query: Record<string, any> = {};
  // Create a query to replace the placeholders.
  await populateQuery(timeStamp, jobID, query);
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
  // Otherwise, i.e. if they were not obtained, report this.
  return {
    status: 'error',
    message: 'Report facts not obtained'
  };
};
