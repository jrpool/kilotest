/*
  index.js
  Answers the orders question.
*/

// IMPORTS

const {
  getJobNames,
  getObject,
} = require('../util');
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
  // For each job in the queue:
  for (const jobName of jobNames.queue) {
    // Get the job.
    const job = await getObject(path.join(jobsPath, 'queue', jobName));
    lines.queue.push(`${margin}<li>${job.target.what}: <code>${job.target.url}</code></li>`);
  }
  // For each claimed job:
  for (const jobName of jobNames.claimed) {
    // Get the job.
    const job = await getObject(path.join(jobsPath, 'queue', jobName));
    lines.claimed.push(`${margin}<li>${job.target.what}: <code>${job.target.url}</code></li>`);
  }
  // Add the lines to the query.
  ['queue', 'claimed'].forEach(category => {
    query[category] = lines[category].join('\n');
  });
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
