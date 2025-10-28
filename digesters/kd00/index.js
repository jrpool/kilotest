/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// index: abbreviated issue-oriented digester for scoring procedure tsp.

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
// Module to classify tool rules into issues
const {issues} = require('../../score/tic');
// Module to process files.
const fs = require('fs/promises');
// Utility module.
const {tools} = require('../../util');

// CONSTANTS

// Newline with indentations.
const innerJoiner = '\n        ';
const outerJoiner = '\n      ';

// FUNCTIONS

// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {score} = report;
  const {details} = score;
  const {issue} = details;
  const issueData = [];
  Object.keys(issue).forEach(issueID => {
    issueData.push([issue[issueID].summary, Object.keys(issue[issueID].tools).map(toolID => tools[toolID])]);
  });
  issueData.sort((a, b) => b[1].length - a[1].length);
  const dataLines = [];
  issueData.forEach(issueDatum => {
    dataLines.push(`<h3>${issueDatum[0]}</h3>`);
    dataLines.push(`<p>Reported by: ${issueDatum[1].join(', ')}</p>`);
  });
  query.data = dataLines.join(outerJoiner);
};
// Returns a digested report.
exports.digester = async (report, query) => {
  // Create a query to replace placeholders.
  await populateQuery(report, query);
  // Get the template.
  let template = await fs.readFile(`${__dirname}/index.html`, 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    template = template.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the digest.
  return template;
};
