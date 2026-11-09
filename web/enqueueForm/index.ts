/*
  index.ts
  Serves a form for approving or rejecting a test request.
*/

// IMPORTS

import {htmlSafe, populateTemplate} from '../../util.ts';
import {getRegistry} from '../../registry.ts';
import {getTargetLabel, getTestRequests} from '../../requests.ts';

// FUNCTIONS

// Returns a test order form.
export const answer = async () => {
  const testRequests = await getTestRequests();
  const registry = await getRegistry();
  const urls = Object.keys(testRequests);
  const margin = ' '.repeat(12);
  const lines: string[] = [];
  // For each page with any requests:
  urls.forEach(url => {
    // Add a radio button and its URL to the lines.
    lines.push(`${margin}<h2><input type="radio" name="target" value="${htmlSafe(url)}" required> ${htmlSafe(url)}</h2>`);
    // For each request for the page:
    testRequests[url]!.forEach(request => {
      const radio = `<input type="radio" name="target" value="${htmlSafe(url)}\t${request.id}" required>`;
      const referral = request.referred ? ' [referred from immediate review]' : '';
      // Add a radio button and a description of the request to the lines.
      lines.push(
        `${margin}    <p>${radio} ${htmlSafe(getTargetLabel(registry, request.target))}${referral}: ${htmlSafe(request.reason)}</p>`
      );
      const suspicions = [
        ...request.possibleDuplicates.map(({pageID, reason}) => `${getTargetLabel(registry, {pageID}).replace(/ \(retest\)$/, '')}: ${reason}`),
        ...request.similarSites.map(({siteID, reason}) => `${registry.sites[siteID]}: ${reason}`)
      ];
      // If the request has any possible duplicates or similar sites:
      if (suspicions.length) {
        // Add them to the lines.
        lines.push(`${margin}    <ul>`);
        suspicions.forEach(suspicion => lines.push(`${margin}      <li>${htmlSafe(suspicion)}</li>`));
        lines.push(`${margin}    </ul>`);
      }
    });
  });
  const query: Record<string, string> = {
    requests: lines.join('\n'),
    noRequests: urls.length ? '' : 'No requests exist now.',
    disabled: urls.length ? '' : 'disabled'
  };
  // Get the populated order form template.
  const answerPage = await populateTemplate(import.meta.dirname, query);
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
