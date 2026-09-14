/*
  index.ts
  Serves a form for approving or rejecting a test request.
*/

// IMPORTS

import {getRecs, populateTemplate} from '../../util.ts';

// FUNCTIONS

// Returns a test order form.
export const answer = async () => {
  const recs = await getRecs() as Record<string, {what: string}[]>;
  const urls = Object.keys(recs);
  const margin = ' '.repeat(12);
  const lines: string[] = [];
  // For each page with any recommendations:
  urls.forEach(url => {
    // Add a radio button and its URL to the lines.
    lines.push(`${margin}<h2><input type="radio" name="target" value="${url}" required> ${url}</h2>`);
    // Get the recommended target names for the page.
    const targetNames = new Set(recs[url]!.map((rec: any) => rec.what));
    // For each recommended target name:
    targetNames.forEach(what => {
      const radio = `<input type="radio" name="target" value="${url}\t${what}" required>`;
      // Add a radio button and the recommended page name to the lines.
      lines.push(`${margin}    <p>${radio} ${what}</p>`);
    });
  });
  const query: Record<string, string> = {
    recs: lines.join('\n'),
    noRecs: urls.length ? '' : 'No recommendations exist now.',
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
