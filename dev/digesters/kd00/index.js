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
  const issueData = [];
  Object.keys(issue).forEach(issueID => {
    const {summary, tools, wcag} = issue[issueID];
    const issueToolNames = Object.keys(tools).map(toolID => toolNames[toolID]);
    const issueXPaths = element[issueID];
    const elementCount = issueXPaths.length;
    issueData.push({
      summary,
      wcag,
      why: issues[issueID].why,
      issueToolNames,
      elementCount
    });
  });
  issueData.sort((a, b) => b.issueToolNames.length - a.issueToolNames.length);
  const dataLines = [];
  issueData.forEach(issueDatum => {
    const {elementCount, issueToolNames, summary, wcag} = issueDatum;
    dataLines.push(`<h3>${summary}</h3>`);
    dataLines.push(`<p>Why it matters: ${issueDatum.why}</p>`);
    if (wcag) {
      dataLines.push(`<p>Related WCAG standard: ${wcag}</p>`);
    }
    dataLines.push(`<p>Reported by: ${issueToolNames.join(', ')}</p>`);
    dataLines.push(`<p>Elements identified: ${elementCount}</p>`);
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
