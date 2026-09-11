/*
  index.ts
  Serves a form for requesting a test.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

exports.answer = async (): Promise<{status: string; answerPage: string}> => {
  // Get the test request form template.
  const answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
