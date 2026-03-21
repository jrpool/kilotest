/*
  index.js
  Answers the recommendations question.
*/

// IMPORTS

const {getRecs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  // Get the recommendations.
  const recs = await getRecs();
  const margin = ' '.repeat(8);
  // Initialize the lines.
  const lines = [];
  // For each recommendation:
  Object.keys(recs).forEach(url => {
    const {what, why} = recs[url];
    // Add a line.
    lines.push(`${margin}<li><code>${url}</code> (${what}): ${why}</li>`);
  });
  // Sort the lines in alphabetical order by URL.
  lines.sort();
  // Add the lines to the query.
  query.recs = lines.join('\n');
  // Add a no-recommendations message, if applicable, to the query.
  query.noRecs = lines.length ? '' : 'No recommendations await approval now.';
};
// Returns a page answering the orders question.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // Get the template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
