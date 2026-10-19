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
  const margin = ' '.repeat(6);
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
      lines.requests.push(`${margin}  <li><code>${url}</code> (${description}): ${reason}</li>`);
    });
  });
  // Sort the lines in alphabetical order by URL and secondarily by proposed name.
  lines.requests.sort();
  // Get the file names of all queued and claimed jobs.
  const jobFileNames = await getJobNames();
  // For each job category:
  for (const category of ['queue', 'claimed'] as const) {
    // For each job in the category:
    for (const fileName of jobFileNames[category]) {
      // Get the job.
      const job = await getObject(path.join(jobsPath(), category, fileName)) as {target: {url: string, what: string}};
      // Add a line.
      lines[category].push(`${margin}  <li><code>${job.target.url}</code> (${job.target.what})</li>`);
    }
  }
  // Initialize the conditional activity sections.
  const sections: string[] = [];
  // Add a section for the test requests, if there are any.
  if (lines.requests.length) {
    sections.push([
      `${margin}<h2>Requested for testing</h2>`,
      `${margin}<ol>`,
      ...lines.requests,
      `${margin}</ol>`,
      `${margin}<p>Kilotest managers can <a href="enqueueForm.html">approve or reject a request</a>.</p>`
    ].join('\n'));
  }
  // Add a section for the queued jobs, if there are any.
  if (lines.queue.length) {
    sections.push([
      `${margin}<h2>Queued for testing</h2>`,
      `${margin}<ol>`,
      ...lines.queue,
      `${margin}</ol>`
    ].join('\n'));
  }
  // Add a section for the claimed jobs, if there are any.
  if (lines.claimed.length) {
    sections.push([
      `${margin}<h2>Being tested now</h2>`,
      `${margin}<ul>`,
      ...lines.claimed,
      `${margin}</ul>`
    ].join('\n'));
  }
  // Add the sections to the query.
  query.jobSections = sections.join('\n');
  // Get extracts of the latest reports about all tested pages, sorted by page description.
  const latestExtracts = await getReportExtracts(true);
  const pageCount = latestExtracts.length;
  // For each tested page:
  for (const extract of latestExtracts) {
    const {id, description} = extract;
    // Add a link to the issues in the latest report about it to the lines.
    const link = `<a href="listIssues.html/${id}" aria-label="Get test results for ${description}">${description}</a>`;
    lines.tested.push(`${margin}  <li>${link}</li>`);
  }
  // Add the lines to the query, as an introduced list if there are any, or else a no-pages message.
  query.testedPages = pageCount
  ? [
    `${margin}<p>Get test results for:</p>`,
    `${margin}<ul class="links">`,
    ...lines.tested,
    `${margin}</ul>`
  ].join('\n')
  : `${margin}<p>No pages have been tested yet.</p>`;
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
