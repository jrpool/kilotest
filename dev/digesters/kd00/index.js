/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
// Module to process files.
const fs = require('fs/promises');
// Issues module.
const {issues} = require('testilo/procs/score/tic');
// Utility module.
const toolNames = require('testilo/procs/util').tools;

// CONSTANTS

// Newline with indentations.
const outerJoiner = '\n      ';

// FUNCTIONS

// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {score} = report;
  const {details} = score;
  const {element, issue} = details;
  // Initialize an array of data on the reported issues.
  const issueData = [];
  // For each issue:
  Object.keys(issue).forEach(issueID => {
    const {summary, tools, wcag} = issue[issueID];
    const issueToolNames = Object.keys(tools).map(toolID => toolNames[toolID]);
    const issueXPaths = element[issueID];
    const elementCount = issueXPaths.length;
    // Add data on it to the array.
    issueData.push({
      summary,
      wcag,
      why: issues[issueID].why,
      issueToolNames,
      elementCount
    });
  });
  // Sort the array in order of decreasing count of reporting tools.
  issueData.sort((a, b) => b.issueToolNames.length - a.issueToolNames.length);
  // Initialize the HTML lines rendering the facts about the issues.
  const dataLines = [];
  // For each issue:
  issueData.forEach(issueDatum => {
    const {elementCount, issueToolNames, summary, wcag} = issueDatum;
    // Add a details element with the issue summary as a summary element to the lines.
    dataLines.push('<details>');
    dataLines.push(`  <summary>${summary}</summary>`);
    dataLines.push(`  <p>Why it matters: ${issueDatum.why}</p>`);
    if (wcag) {
      dataLines.push(`  <p>Related WCAG standard: ${wcag}</p>`);
    }
    dataLines.push(`  <p>Reported by: ${issueToolNames.join(', ')}</p>`);
    dataLines.push(`  <p>Elements identified: ${elementCount}</p>`);
    dataLines.push('</details>');
  });
  query.data = dataLines.join(outerJoiner);
};
// Returns a digested report with the complete report as a collapsed appendix.
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
