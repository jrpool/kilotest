/*
  index.js
  Lists the actions that managers can take.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns the answer page.
exports.answer = async () => {
  // Get the answer page.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
