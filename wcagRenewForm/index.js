/*
  index.js
  Serves a form for renewing the WCAG map.
*/

// IMPORTS

const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a form for renewing the WCAG map.
exports.answer = async () => {
  // Get the map renewal form.
  const answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Return it.
  return {
    status: 'ok',
    answerPage
  };
};
