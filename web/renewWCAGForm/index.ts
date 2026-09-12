/*
  index.ts
  Serves a form for renewing the WCAG map.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Returns a form for renewing the WCAG map.
export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the map renewal form.
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
