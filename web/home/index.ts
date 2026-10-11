/*
  index.ts
  Serves the home page.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

// Returns the home page.
export const answer = async () => {
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};
