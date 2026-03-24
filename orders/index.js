/*
  index.js
  Answers the orders question.
*/

// IMPORTS

const {getJobNames, getObject, jobsPath} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  // Get the file names of all queued and claimed jobs.
  const jobNames = await getJobNames();
  const margin = ' '.repeat(8);
  // Initialize the lines.
  const lines = {
    queue: [],
    claimed: []
  };
  // For each job category:
  for (const category of ['queue', 'claimed']) {
    // For each job in the category:
    for (const jobName of jobNames[category]) {
      // Get the job.
      const job = await getObject(path.join(jobsPath, category, jobName));
      // Add a line.
      lines[category].push(`${margin}<li><code>${job.target.url}</code> (${job.target.what})</li>`);
    }
    // Add the lines to the query.
    query[category] = lines[category].join('\n');
  }
  // Add a no-queued message, if applicable, to the query.
  query.noQueued = lines.queue.length ? '' : 'No pages are queued for testing.';
  // Add a no-claimed message, if applicable, to the query.
  query.noClaimed = lines.claimed.length ? '' : 'No pages are being tested now.';
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
