/*
  index.ts
  Lists all tested pages, with links to the latest reports about them.
*/

// IMPORTS

import {
  getJobNames,
  getObject,
  getReportExtracts,
  getTestRequests,
  jobsPath,
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
  // For each job category:
  for (const category of ['queue', 'claimed'] as const) {
    // For each job in the category:
    for (const fileName of jobFileNames[category]) {
      // Get the job.
      const job = await getObject(path.join(jobsPath(), category, fileName)) as {target: {url: string, what: string}};
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
  // Get extracts of the latest reports about all tested pages, sorted by page description.
  const latestExtracts = await getReportExtracts(true);
  const pageCount = latestExtracts.length;
  // For each tested page:
  for (const extract of latestExtracts) {
    const {jobID, timeStamp, description} = extract;
    // Add a link to the issues in the latest report about it to the lines.
    const link = `<a href="listIssues.html/${timeStamp}/${jobID}" aria-label="Get test results for ${description}">${description}</a>`;
    lines.tested.push(`${margin}  <li>${link}</li>`);
  }
  // Add the lines to the query, as a list if there are any.
  query.testedPages = pageCount
  ? [`${margin}<ul class="links">`, ...lines.tested, `${margin}</ul>`].join('\n')
  : '';
};
// Returns a page listing the tested pages.
export const answer = async () => {
  const query: Record<string, any> = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // Get the populated template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
