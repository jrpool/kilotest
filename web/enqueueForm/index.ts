/*
  index.ts
  Serves a form for approving or rejecting a test request.
*/

// IMPORTS

import {getTestRequests, populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns a test order form.
export const answer = async () => {
  const testRequests = await getTestRequests() as Record<string, {description: string}[]>;
  const urls = Object.keys(testRequests);
  const margin = ' '.repeat(12);
  const lines: string[] = [];
  // For each page with any requests:
  urls.forEach(url => {
    // Add a radio button and its URL to the lines.
    lines.push(`${margin}<h2><input type="radio" name="target" value="${url}" required> ${url}</h2>`);
    // Get the requested target names for the page.
    const targetNames = new Set(testRequests[url]!.map((req: any) => req.description));
    // For each requested target name:
    targetNames.forEach(description => {
      const radio = `<input type="radio" name="target" value="${url}\t${description}" required>`;
      // Add a radio button and the requested page name to the lines.
      lines.push(`${margin}    <p>${radio} ${description}</p>`);
    });
  });
  const query: Record<string, string> = {
    requests: lines.join('\n'),
    noRequests: urls.length ? '' : 'No requests exist now.',
    disabled: urls.length ? '' : ' disabled'
  };
  // Get the populated order form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
