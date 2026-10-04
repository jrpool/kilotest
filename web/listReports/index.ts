/*
  index.ts
  Lists all available reports.
*/

// IMPORTS

import {
  getJobNames,
  getObject,
  getReport,
  getReportExtracts,
  getTestRequests,
  isReportError,
  jobsPath,
  objectSort,
  populateTemplate
} from '../../util.ts';
import {
  getMultiReportWhats,
  getPageDataStrings,
  getPageFactsLines,
  getReportData
} from '../util.ts';
import path from 'node:path';

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (query: Record<string, any>) => {
  const margin = ' '.repeat(8);
  // Initialize the classes of lines.
  const lines: {requests: string[], queue: string[], claimed: string[], tested: string[]} = {
    requests: [],
    queue: [],
    claimed: [],
    tested: []
  };
  // Get the test requests.
  const testRequests = await getTestRequests();
  // For each requested URL:
  Object.keys(testRequests).forEach(url => {
    // For each of its requests:
    testRequests[url]!.forEach((req: any) => {
      const {description, reason} = req;
      // Add a line.
      lines.requests.push(`${margin}<li><code>${url}</code> (${description}): ${reason}</li>`);
    });
  });
  // Sort the lines in alphabetical order by URL and secondarily by proposed name.
  lines.requests.sort();
  // Add the lines to the query.
  query.requests = lines.requests.join('\n');
  // Add a no-requests message, if applicable, to the query.
  query.noRequests = lines.requests.length
  ? 'Kilotest managers can <a href="enqueueForm.html">approve or reject a request</a>.'
  : 'No requests await approval now.';
  // Get the file names of all queued and claimed jobs.
  const jobFileNames = await getJobNames();
  // Initialize sets of the page descriptions and URLs of jobs in both categories.
  const jobsData = {
    queue: {
      descriptions: new Set(),
      urls: new Set()
    },
    claimed: {
      descriptions: new Set(),
      urls: new Set()
    }
  };
  // For each job category:
  for (const category of ['queue', 'claimed'] as const) {
    // For each job in the category:
    for (const fileName of jobFileNames[category]) {
      // Get the job.
      const job = await getObject(path.join(jobsPath(), category, fileName)) as {target: {url: string, what: string}};
      // Get the description and URL of its page.
      const {target} = job;
      const {what, url} = target;
      // Ensure they are in the sets of properties of the category.
      jobsData[category].descriptions.add(what);
      jobsData[category].urls.add(url);
      // Add a line.
      lines[category].push(`${margin}<li><code>${job.target.url}</code> (${job.target.what})</li>`);
    }
    // Add the lines to the query.
    query[category] = lines[category].join('\n');
  }
  // Add a no-queued message, if applicable, to the query.
  query.noQueued = lines.queue.length ? '' : 'No pages are queued for testing.';
  // Add a no-claimed message, if applicable, to the query.
  query.noClaimed = lines.claimed.length ? '' : 'No pages are being tested now.';
  // Get extracts of all available reports.
  const reportExtracts = await getReportExtracts();
  const reportCount = reportExtracts.length;
  query.which = reportCount ? 'the following' : 'no';
  query.some = (reportCount || jobFileNames.queue.length || jobFileNames.claimed.length)
  ? 'another'
  : 'a';
  const multiReportWhats = await getMultiReportWhats();
  // Sort them primarily by page description and secondarily by completion time.
  let sortedExtracts = objectSort(reportExtracts, 'reportTime', 'alpha');
  sortedExtracts = objectSort(sortedExtracts, 'description', 'alpha');
  // For each report:
  for (const extract of sortedExtracts) {
    const {jobID, timeStamp, url, description, superseded} = extract;
    // Get the report.
    const report = await getReport(timeStamp, jobID);
    // If this failed:
    if (isReportError(report)) {
      console.error(report.error);
      // Populate the query with the reason.
      query.error = report.error;
      // Stop populating the query.
      return;
    }
    // Otherwise, i.e. if it succeeded, get data about the report.
    const reportData = getReportData(report);
    const pageDataStrings = getPageDataStrings(report);
    const {issueCount} = reportData;
    const {testInfo} = pageDataStrings;
    // Add lines about the report.
    lines.tested.push(`${margin}<details>`);
    const testText = multiReportWhats.includes(description) ? ` (${testInfo.toLowerCase()})` : '';
    lines.tested.push(`${margin}  <summary>${description}${testText}</summary>`);
    // Add the page facts to the lines.
    lines.tested.push(...getPageFactsLines(pageDataStrings, reportData, `${margin}  `));
    lines.tested.push(`${margin}  <ul class="nav">`);
    // If any issues were reported:
    if (issueCount) {
      // Add a link to issue details to the lines.
      const href = `href="listIssues.html/${timeStamp}/${jobID}"`;
      const label = `aria-label="issue details for the ${description} page"`;
      const link = `<a ${href} ${label}>Issue details</a>`;
      lines.tested.push(`${margin}    <li>${link}</li>`);
    }
    let retestString: string = '';
    // If a page with the same description or URL is being tested:
    if (jobsData.claimed.descriptions.has(description) || jobsData.claimed.urls.has(url)) {
      // Report this.
      retestString = 'Currently being retested';
    }
    // Otherwise, if such a page is queued:
    else if (jobsData.queue.descriptions.has(description) || jobsData.queue.urls.has(url)) {
      retestString = 'Currently in the queue for retesting';
    }
    // Otherwise, if no such page is being tested or queued and the report is not superseded:
    else if (!superseded) {
      // Make the page available for retesting.
      const href = `/requestRetestForm.html/${timeStamp}/${jobID}`;
      const retestContent = 'Should Kilotest retest the page?';
      retestString = `<a href="${href}">${retestContent}</a>`;
    }
    if (retestString) {
      lines.tested.push(`${margin}    <li>${retestString}</li>`);
    }
    lines.tested.push(`${margin}  </ul>`);
    lines.tested.push(`${margin}</details>`);
  }
  query.testedPages = lines.tested.join('\n');
};
// Returns a page answering the targets question.
export const answer = async () => {
  const query: Record<string, any> = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // If the query reports an error:
  if (query.error) {
    // Return it.
    return {
      status: 'error',
      message: query.error
    };
  }
  // Otherwise, i.e. if it does not report an error, get the template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
