/*
  index.ts
  Serves usage metrics for the maintainer: web page views, MCP tool calls, and API
  operation calls, each broken down by name, recorded since a given date and time.
*/

// IMPORTS

import fs from 'node:fs/promises';
import {getDateTimeString, metricsPath, populateTemplate} from '../../util.ts';
import type {Metrics} from '../../util.ts';

// FUNCTIONS

// Returns an HTML table of the counts in a metrics category, sorted by descending count.
const getCategoryTable = (counts: Record<string, number>): string => {
  const margin = ' '.repeat(6);
  const names = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]!);
  if (!names.length) {
    return `${margin}<p>None yet.</p>`;
  }
  const rows = names.map(name => `${margin}    <tr><td>${name}</td><td>${counts[name]}</td></tr>`);
  return [
    `${margin}<table class="allBorder">`,
    `${margin}  <thead>`,
    `${margin}    <tr><th>Name</th><th>Count</th></tr>`,
    `${margin}  </thead>`,
    `${margin}  <tbody>`,
    ...rows,
    `${margin}  </tbody>`,
    `${margin}</table>`
  ].join('\n');
};
// Returns a page reporting usage metrics.
export const answer = async (_: any, search: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  // If the authorization code is invalid:
  if (authCode !== process.env.AUTH_CODE) {
    // Report the error.
    return {
      status: 'error',
      message: 'Invalid authorization code'
    };
  }
  let metrics: Metrics;
  try {
    metrics = JSON.parse(await fs.readFile(metricsPath(), 'utf8'));
  }
  // If no metric has been recorded yet:
  catch {
    metrics = {since: '', pageViews: {}, mcpToolCalls: {}, apiOperations: {}};
  }
  const query: Record<string, string> = {
    since: metrics.since ? getDateTimeString(metrics.since) : 'not yet available',
    pageViews: getCategoryTable(metrics.pageViews),
    mcpToolCalls: getCategoryTable(metrics.mcpToolCalls),
    apiOperations: getCategoryTable(metrics.apiOperations)
  };
  // Get the populated template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
