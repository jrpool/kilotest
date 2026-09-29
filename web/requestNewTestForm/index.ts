/*
  index.ts
  Serves a form for requesting a test.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

export const answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the test request form template.
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
