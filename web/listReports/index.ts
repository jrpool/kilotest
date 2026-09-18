/*
  index.ts
  Lists all available reports.
*/

// IMPORTS

import {
  getAgoDays,
  getCountString,
  getJobNames,
  getMultiReportWhats,
  getObject,
  getPageDataStrings,
  getTestRequests,
  getReportData,
  getReportExtracts,
  jobsPath,
  objectSort,
  populateTemplate
} from '../../util.ts';
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
      const {description, why} = req;
      // Add a line.
      lines.requests.push(`${margin}<li><code>${url}</code> (${description}): ${why}</li>`);
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
    // Get data about it.
    const reportData = await getReportData(timeStamp, jobID);
    // If this failed:
    if (reportData.error !== undefined) {
      console.error(reportData.error);
      // Populate the query with the reason.
      query.error = reportData.error;
      // Stop populating the query.
      return;
    }
    const {
      issueCount,
      preventedEngineCount,
      preventedEngineNames,
      reporterNames,
      reporterCount,
      violatorCount
    } = reportData;
    // Otherwise, i.e. if it succeeded, add lines about the report.
    lines.tested.push(`${margin}<details>`);
    const daysAgo = getAgoDays(timeStamp);
    const pageDataStrings = await getPageDataStrings(timeStamp, jobID, {description, url, daysAgo});
    const {urlLink, testInfo}: any = pageDataStrings;
    const testText = multiReportWhats.includes(description) ? ` (${testInfo.toLowerCase()})` : '';
    lines.tested.push(`${margin}  <summary>${description}${testText}</summary>`);
    lines.tested.push(`${margin}  <ul>`);
    // Add the URL of the target to the lines.
    lines.tested.push(`${margin}    <li>URL: ${urlLink}</li>`);
    // Add facts about the report to the lines.
    lines.tested.push(`${margin}    <li>${testInfo}</li>`);
    // If the page prevented any rule engine from performing its tests:
    if (preventedEngineCount) {
      // Add this to the lines.
      const engineCountString = getCountString(preventedEngineCount, 'rule engine', 'rule engines');
      lines.tested.push(
        `${margin}    <li>Page not testable by ${engineCountString} (${preventedEngineNames.join(' + ')})</li>`,
      );
    }
    // Add facts about the test results to the lines.
    let reporterString = `${getCountString(reporterCount, 'rule engine', 'rule engines')} reported issues`;
    if (reporterCount) {
      const reporterNamesString = reporterNames.join(' + ');
      reporterString = `${reporterString} (${reporterNamesString})`;
    }
    const issueCountString = getCountString(issueCount, 'issue was', 'issues were');
    const violatorString = getCountString(violatorCount, 'violator was', 'violators were');
    lines.tested.push(`${margin}    <li>${reporterString}</li>`);
    lines.tested.push(`${margin}    <li>${issueCountString} reported</li>`);
    lines.tested.push(`${margin}    <li>${violatorString} reported</li>`);
    lines.tested.push(`${margin}  </ul>`);
    lines.tested.push(`${margin}<ul class="nav">`);
    // If any issues were reported:
    if (issueCount) {
      // Add a question link about the reported issues to the lines.
      const href = `href="listIssues.html/${timeStamp}/${jobID}"`;
      const label = `aria-label="What ${issueCountString} reported for the ${description} page?"`;
      const questionString = issueCount === 1 ? 'was the issue' : 'were the issues';
      const link = `<a ${href} ${label}>What ${questionString}?</a>`;
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
