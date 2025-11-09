/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// index: abbreviated issue-oriented digester for scoring procedure tsp.

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
// Module to process files.
const fs = require('fs/promises');
// Utility module.
const toolNames = require('testilo/procs/util').tools;

// CONSTANTS

// Newline with indentations.
const outerJoiner = '\n      ';

// FUNCTIONS

// Adds parameters to a query for a digest.
const populateQuery = async (jobsData, query) => {
  jobsData.sort((a, b) => a.score - b.score);
  const bestScore = jobsData[0].score;
  for (let i = 0; i < jobsData.length; i++) {
    jobsData[i].worsePercent = 100 * round(jobsData[i].score / bestScore) - 100;
  }
  const dataLines = [];
  jobsData.forEach(jobData => {
    dataLines.push(`<h3>${jobData.what}</h3>`);
    dataLines.push(`<p>URL: ${jobData.url}</p>`);
    if (jobData.worsePercent === 0) {
      dataLines.push('<p><strong>Best</strong></p>');
    }
    else {
      dataLines.push(`<p><strong>${jobData.worsePercent}% worse</strong> than the best</p>`);
    }
  });
  query.data = dataLines.join(outerJoiner);
};
// Returns digested results.
exports.digester = async (jobsData, query) => {
  // Create a query to replace placeholders.
  await populateQuery(jobsData, query);
  // Get the template.
  let template = await fs.readFile(`${__dirname}/index.html`, 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    template = template.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the digest.
  return template;
};
