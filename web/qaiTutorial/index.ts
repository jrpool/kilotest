/*
  index.ts
  Serves the QAI (Connect an AI Platform to Kilotest) tutorial.
*/

// IMPORTS

import fs from 'node:fs/promises';
import path from 'node:path';

// FUNCTIONS

export const answer = async () => {
  const answerPage = await fs.readFile(path.join(import.meta.dirname, 'index.html'), 'utf8');
  return {
    status: 'ok',
    answerPage
  };
};
