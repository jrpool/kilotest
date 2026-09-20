/*
  index.ts
  Serves usage metrics for the maintainer: web page views, MCP tool calls, and API
  operation calls, each broken down by name, recorded since a given date and time.
*/

// IMPORTS

import {
  clearMetrics, getDateTimeString, getExclusionCookieValue, getMetrics, metricsExclusionCookieName, populateTemplate
} from '../../util.ts';

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
// Returns an HTML table of manager-page activity, sorted by descending failure count,
// since repeated failures are the signal of suspected abuse most worth surfacing first.
const getManagerActivityTable = (activity: Record<string, {ok: number; error: number}>): string => {
  const margin = ' '.repeat(6);
  const names = Object.keys(activity).sort((a, b) => activity[b]!.error - activity[a]!.error);
  if (!names.length) {
    return `${margin}<p>None yet.</p>`;
  }
  const rows = names.map(name => {
    const {ok, error} = activity[name]!;
    return `${margin}    <tr><td>${name}</td><td>${ok}</td><td>${error}</td></tr>`;
  });
  return [
    `${margin}<table class="allBorder">`,
    `${margin}  <thead>`,
    `${margin}    <tr><th>Name</th><th>Successful</th><th>Failed</th></tr>`,
    `${margin}  </thead>`,
    `${margin}  <tbody>`,
    ...rows,
    `${margin}  </tbody>`,
    `${margin}</table>`
  ].join('\n');
};
// Returns a page reporting usage metrics, or, if the form has not been submitted (a POST
// request) yet, a form requesting an authorization code. A GET request, regardless of its
// query string, never processes a submission, so the action cannot be triggered by GET.
export const answer = async (_: any, search: string, method: string) => {
  const searchParams = new URLSearchParams(search);
  const authCode = searchParams?.get('authCode');
  let query: Record<string, string>;
  // If the form has been submitted:
  if (method === 'POST') {
    // If the authorization code is invalid:
    if (authCode !== process.env.AUTH_CODE) {
      // Report the error.
      return {
        status: 'error',
        message: 'Invalid authorization code'
      };
    }
    // If clearing the counts was requested:
    const clearCounts = searchParams.has('clearCounts');
    const metrics = clearCounts ? await clearMetrics() : await getMetrics();
    query = {
      body: [
        ...(clearCounts ? ['<p>Counts cleared.</p>'] : []),
        `<p>Counts recorded since ${getDateTimeString(metrics.since)}.</p>`,
        '<h2>Web page views</h2>',
        getCategoryTable(metrics.pageViews),
        '<h2>MCP tool calls</h2>',
        getCategoryTable(metrics.mcpToolCalls),
        '<h2>API operation calls</h2>',
        getCategoryTable(metrics.apiOperations),
        '<h2>Manager page activity</h2>',
        '<p>Manager-only pages (linked from <a href="/manage.html">management</a>), excluded from the web page views above. A high failed count for a page may indicate a suspected attack, such as repeated guessing of the authorization code.</p>',
        getManagerActivityTable(metrics.managerActivity)
      ].join('\n')
    };
  }
  // Otherwise, i.e. if the form has not been submitted yet:
  else {
    query = {
      body: [
        '<form action="/metrics.html" method="post">',
        '  <p><label>',
        '    Authorization code: <input size="3" minlength="3" maxlength="3" name="authCode" required>',
        '  </label></p>',
        '  <p><label><input type="checkbox" name="clearCounts"> Clear counts</label></p>',
        '  <p><button type="submit">Submit</button></p>',
        '</form>'
      ].join('\n')
    };
  }
  // Get the populated template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page. Submitting a valid authCode also sets a cookie that
  // excludes this browser's future page views and API calls from usage metrics, on the
  // premise that a maintainer who has just proven their identity here is very likely the
  // same person about to manually browse and test the rest of Kilotest.
  return {
    status: 'ok',
    answerPage,
    ...(method === 'POST' && {
      setCookie: {
        name: metricsExclusionCookieName,
        value: getExclusionCookieValue(),
        maxAgeSeconds: 30 * 24 * 60 * 60
      }
    })
  };
};
