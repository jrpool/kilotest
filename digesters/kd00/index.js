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
// Issues module.
const {issues} = require('testilo/procs/score/tic');
// Utility module.
const {tools} = require('testilo/procs/util');

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
    const {summary, tools} = issue[issueID];
    const toolNames = Object.keys(tools).map(toolID => tools[toolID]);
    issueData.push({
      summary,
      why: issues[issueID].why,
      toolNames
    });
  });
  issueData.sort((a, b) => b.toolNames.length - a.toolNames.length);
  const dataLines = [];
  issueData.forEach(issueDatum => {
    dataLines.push(`<h3>${issueDatum.summary}</h3>`);
    dataLines.push(`<p>Impact: ${issueDatum.why}</p>`);
    dataLines.push(`<p>Reported by: ${issueDatum.toolNames.join(', ')}</p>`);
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
