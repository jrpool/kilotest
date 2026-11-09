/*
  index.ts
  Lists all tested sites, with links to lists of their tested pages, after any requested new sites: sites named in requests awaiting approval and sites whose first jobs are queued or being tested.
*/

// IMPORTS

import {alphaCompare, getJobsData, getReportExtracts, htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {getTestRequests} from '../../requests.ts';

// CONSTANTS

// Descriptions of the statuses of requested new sites, by job category or pending status.
const statuses = {pending: 'awaiting approval', queue: 'queued for testing', claimed: 'being tested'} as const;

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (query: Record<string, string>) => {
  const margin = ' '.repeat(6);
  const registry = await getRegistry();
  const testedPageIDs = new Set((await getReportExtracts(true)).map(extract => extract.pageID));
  // Get the identifiers of the sites with any tested page.
  const testedSiteIDs = new Set(
    [...testedPageIDs].flatMap(pageID => registry.pages[pageID]?.sites ?? [])
  );
  // Get the requested new sites, as descriptions of their names and statuses.
  const requested = new Set<string>();
  // For each request awaiting approval:
  for (const request of Object.values(await getTestRequests()).flat()) {
    // If it names a new site:
    if ('siteName' in request.target) {
      requested.add(`${htmlSafe(request.target.siteName)} (${statuses.pending})`);
    }
  }
  // For each category of approved jobs:
  for (const category of ['queue', 'claimed'] as const) {
    // For each job in it for a page of a site with no tested page:
    for (const {pageID} of await getJobsData(category)) {
      const siteID = registry.pages[pageID]?.sites[0];
      if (siteID && !testedSiteIDs.has(siteID)) {
        requested.add(`${htmlSafe(registry.sites[siteID] as string)} (${statuses[category]})`);
      }
    }
  }
  const hasPending = [...requested].some(item => item.endsWith(`(${statuses.pending})`));
  // Add a section for the requested new sites, if there are any.
  query.requestedSites = requested.size ? [
    `${margin}<h2>Requested new sites</h2>`,
    `${margin}<ul>`,
    ...[...requested].sort(alphaCompare).map(item => `${margin}  <li>${item}</li>`),
    `${margin}</ul>`,
    ...(hasPending ? [`${margin}<p>Kilotest managers can <a href="/enqueueForm.html">approve or reject a request</a>.</p>`] : [])
  ].join('\n') : '';
  const lines: string[] = [];
  // Get the counts of tested pages of the sites with any, ordered by site name.
  const siteCounts = Object.keys(registry.sites)
  .map(siteID => ({
    siteID,
    name: registry.sites[siteID] as string,
    count: Object.entries(registry.pages)
    .filter(([pageID, page]) => page.sites.includes(siteID) && testedPageIDs.has(pageID)).length
  }))
  .filter(site => testedSiteIDs.has(site.siteID))
  .sort((a, b) => alphaCompare(a.name, b.name));
  // For each tested site:
  for (const {siteID, name, count} of siteCounts) {
    // Add a link to the list of its tested pages to the lines.
    const pages = count === 1 ? '1 tested page' : `${count} tested pages`;
    lines.push(`${margin}  <li><a href="/listPages.html/${siteID}">${htmlSafe(name)} (${pages})</a></li>`);
  }
  // Add the lines to the query, as an introduced list if there are any, or else a no-sites message.
  query.testedSites = siteCounts.length
  ? [
    `${margin}<p>Get test results for:</p>`,
    `${margin}<ul class="links">`,
    ...lines,
    `${margin}</ul>`
  ].join('\n')
  : `${margin}<p>No sites have been tested yet.</p>`;
};
// Returns a page listing the tested sites.
export const answer = async () => {
  const query: Record<string, string> = {};
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
