/*
  index.ts
  Lists the actions that managers can take.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Returns the answer page.
export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the answer page.
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
