/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
const { LegacyESLint } = require('eslint/use-at-your-own-risk');
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
    const elementData = element[issueID];
    // Add data on it to the array.
    issueData.push({
      summary,
      wcag,
      why: issues[issueID].why,
      issueToolNames,
      elementData
    });
  });
  // Sort the array in order of decreasing count of reporting tools.
  issueData.sort((a, b) => b.issueToolNames.length - a.issueToolNames.length);
  // Initialize the HTML lines rendering the facts about the issues.
  const dataLines = [];
  // For each issue:
  issueData.forEach(issueDatum => {
    const {elementData, issueToolNames, summary, wcag} = issueDatum;
    // Add a summary and expandable details to the lines.
    dataLines.push('<details>');
    dataLines.push(`  <summary>${summary}</summary>`);
    dataLines.push(`  <p>Why it matters: ${issueDatum.why}</p>`);
    if (wcag) {
      dataLines.push(`  <p>Related WCAG standard: ${wcag}</p>`);
    }
    const toolCount = issueToolNames.length;
    const toolNameList = issueToolNames.join(' + ');
    if (toolCount > 1) {
      dataLines.push(`  <p>Reported by ${toolCount} tools (${toolNameList})</p>`);
    } else {
      dataLines.push(`  <p>Reported by 1 tool (${toolNameList})</p>`);
    }
    // If any elements were reported as exhibiting the issue:
    if (elementData && Object.keys(elementData).length) {
      let elementToolLists = Object.keys(elementData).sort();
      elementToolLists = elementToolLists.sort(
        (a, b) => b.split(/ \+ /).length - a.split(/ \+ /).length
      );
      // Add lines reporting which tools reported which elements as doing so.
      dataLines.push('  <p>Where reported:');
      elementToolLists.forEach(elementToolList => {
        const elementToolIDs = elementToolList.split(/ \+ /);
        const elementToolNameList = elementToolIDs.map(toolID => toolNames[toolID]).join(' + ');
        dataLines.push('  <ul class="whereList">');
        const toolCount = elementToolIDs.length;
        const elementCount = elementData[elementToolList].length;
        const inWhat = elementCount > 1 ? `${elementCount} elements` : '1 element';
        const byWhat = toolCount > 1 ? `${toolCount} tools` : '1 tool';
        dataLines.push(`    <li>Reported in ${inWhat} by ${byWhat} (${elementToolNameList}):</li>`);
        dataLines.push('    <ul class="xPathList">');
        elementData[elementToolList].forEach(xPath => {
          dataLines.push((`    <li>${xPath}</li>`));
        });
        dataLines.push('    </ul>');
        dataLines.push('    </li>');
        dataLines.push('  </ul>');
      });
    }
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
