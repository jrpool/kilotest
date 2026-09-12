/*
  index.ts
  Renews the WCAG map.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';
import {getJSON} from '../../util.ts';

// FUNCTIONS

// Renews the WCAG map and serves an acknowledgment.
export const answer = async (authCode: string) => {
  // If the authorization code is valid:
  if (authCode === process.env.AUTH_CODE) {
    // Get the map source response.
    const mapSourceResponse = await fetch('https://www.w3.org/WAI/WCAG22/Understanding/');
    const mapSourceStatus = mapSourceResponse.status;
    // If the acquisition succeeded:
    if (mapSourceStatus === 200) {
      // Get the HTML of the map source page.
      const mapSourceHTML = await mapSourceResponse.text();
      // Get the entries from the HTML.
      const mapEntries = mapSourceHTML.matchAll(
        /<a href="([^"]+)"><span class="secno">([\d.]+) *<\/span>/g
      );
      // If there are entries:
      if (mapEntries) {
        // Initialize the WCAG map.
        const wcagMap: Record<string, string> = {};
        // For each entry:
        for (const entry of mapEntries) {
          // Add it to the map.
          wcagMap[entry[2]] = entry[1];
        }
        // Save the map, replacing any existing one.
        await fs.writeFile(path.join(import.meta.dirname, '..', '..', 'wcagMap.json'), getJSON(wcagMap));
        // Get the acknowledgment page.
        const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
        // Return it.
        return {
          status: 'ok',
          answerPage
        };
      }
      // Otherwise, i.e. if there are no entries:
      else {
        // Report this.
        return {
          status: 'error',
          message: 'No entries found in WCAG map source'
        };
      }
    }
    else {
      return {
        status: 'error',
        message: 'WCAG map source not retrieved'
      };
    }
  }
  else {
    return {
      status: 'error',
      message: 'Authorization code invalid'
    };
  }
};
