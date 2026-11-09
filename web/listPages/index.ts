/*
  index.ts
  Lists the tested pages of a site, with links to the latest reports about them, after any of its pages requested for testing: pages in requests awaiting approval and pages whose jobs are queued or being tested.
*/

// IMPORTS

import {getJobsData, getReportExtracts, htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry, getSitePages, isSiteID} from '../../registry.ts';
import {getTestRequests} from '../../requests.ts';

// CONSTANTS

// Descriptions of the statuses of requested pages, by job category or pending status.
const statuses = {pending: 'awaiting approval', queue: 'queued for testing', claimed: 'being tested'} as const;

// FUNCTIONS

// Returns a page listing the tested pages of a site.
export const answer = async (siteID: string) => {
  const registry = await getRegistry();
  const siteName = isSiteID(siteID) ? registry.sites[siteID] : undefined;
  // If the site does not exist:
  if (siteName === undefined) {
    return {
      status: 'error',
      message: 'Request for a nonexistent site'
    };
  }
  const margin = ' '.repeat(6);
  // Get the identifiers of the latest reports about the tested pages.
  const latestReportIDs = new Map((await getReportExtracts(true)).map(extract => [extract.pageID, extract.id]));
  // Get the tested pages of the site, ordered by name.
  const pages = getSitePages(registry, siteID).filter(([pageID]) => latestReportIDs.has(pageID));
  // Get a list item for each of them, linking to the issues in the latest report about it.
  const items = pages.map(([pageID, {name, url}]) => {
    const safeName = htmlSafe(name);
    const link = `<a href="/listIssues.html/${latestReportIDs.get(pageID)}" aria-label="Get test results for ${safeName}">${safeName}</a>`;
    // The block display of the link places the URL below it.
    return `${margin}  <li>${link} <code>${htmlSafe(url)}</code></li>`;
  });
  // Get the pages of the site requested for testing, as descriptions of their names, URLs, and statuses.
  const requested: string[] = [];
  const describe = (pageName: string, url: string, status: string) =>
    `${margin}  <li>${htmlSafe(pageName)} (<code>${htmlSafe(url)}</code>): ${status}</li>`;
  // For each request awaiting approval:
  for (const request of Object.values(await getTestRequests()).flat()) {
    const {target} = request;
    // If it is for a new page of the site:
    if ('siteID' in target && target.siteID === siteID) {
      requested.push(describe(target.pageName, target.url, `new page, ${statuses.pending}`));
    }
    // Otherwise, if it is for a retest of a page of the site:
    else if ('pageID' in target && registry.pages[target.pageID]?.sites.includes(siteID)) {
      const {name, url} = registry.pages[target.pageID] as {name: string; url: string};
      requested.push(describe(name, url, `retest, ${statuses.pending}`));
    }
  }
  // For each category of approved jobs:
  for (const category of ['queue', 'claimed'] as const) {
    // For each job in it for a page of the site:
    for (const {pageID} of await getJobsData(category)) {
      const page = registry.pages[pageID];
      if (page?.sites.includes(siteID)) {
        const kind = latestReportIDs.has(pageID) ? 'retest' : 'new page';
        requested.push(describe(page.name, page.url, `${kind}, ${statuses[category]}`));
      }
    }
  }
  const query: Record<string, string> = {
    siteID,
    // Add a section for the requested pages, if there are any.
    requestedPages: requested.length
      ? [`${margin}<h2>Requested for testing</h2>`, `${margin}<ul>`, ...requested, `${margin}</ul>`].join('\n')
      : '',
    siteName: htmlSafe(siteName),
    // Add the list items as an introduced list if there are any, or else a no-pages message.
    testedPages: items.length
      ? [`${margin}<p>Get test results for:</p>`, `${margin}<ul class="links">`, ...items, `${margin}</ul>`].join('\n')
      : `${margin}<p>No pages of this site have been tested yet.</p>`
  };
  // Return the populated page.
  return {
    status: 'ok',
    answerPage: await populateTemplate(import.meta.dirname, query)
  };
};
