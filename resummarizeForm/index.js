/*
  index.js
  Serves a form for resummarizing all reports.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for resummarizing all reports.
exports.answer = async () => {
  // Get the order form template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
