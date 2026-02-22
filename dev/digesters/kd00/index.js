/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
// Module to process files.
const fs = require('fs/promises');
// Module to classify rules into issues.
const {tally} = require('../../../tally');
// Utility module.
const toolNames = require('testaro/procs/job').tools;

// CONSTANTS

// Newline with indentations.
const outerJoiner = '\n      ';

// FUNCTIONS

// Encodes a string for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {catalog, target} = report;
  const {url} = target;
  // Get data on the classified issues and the reported violators of rules belonging to them.
  const issues = tally(report);
  // Initialize the HTML lines rendering facts about the issues.
  const lines = [];
  const weightNames = ['Highest', 'High', 'Low', 'Lowest'];
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const violationIssues = issues.filter(issue => issue.weight === weight && issue.count);
    // If any violations of rules belonging to issues of the weight were reported:
    if (violationIssues.length) {
      const weightName = weightNames[4 - weight];
      // Add a details element to the lines for the weight.
      lines.push('<details>');
      // Add the weight name as a summary.
      dataLines.push(`  <summary><h3 class="priority">${weightName} priority</h3></summary>`);
      // For each issue of the weight with any violations:
      weightIssues.forEach(issue => {
        const {reporters, summary, violators, wcag, why} = issue;
        // Add issue details, a summary, an impact, and a related WCAG standard to the lines.
        dataLines.push('  <details>');
        dataLines.push(`    <summary>${summary}</summary>`);
        dataLines.push(`    <p>Why it matters: ${why}</p>`);
        if (wcag) {
          dataLines.push(`    <p>Related WCAG standard: ${wcag}</p>`);
        }
        const reporterCount = reporters.length;
        const reporterList = reporters.map(reporter => toolNames[reporter]).join(' + ');
        // Add the names and a count of issue reporters to the lines.
        if (reporterCount > 1) {
          dataLines.push(`    <p>Reported by ${reporterCount} tools (${reporterList})</p>`);
        } else {
          dataLines.push(`    <p>Reported by 1 tool (${reporterList})</p>`);
        }
        let currentReporterList = '';
        const violatorIDs = Object.keys(violators);
        // If any violations were attributed to elements:
        if (violatorIDs.length) {
          // Add a heading for the violators to the lines.
          dataLines.push('    <h3>Elements with this issue</h3>');
          // For each such violator:
          violatorIDs.forEach(violatorID => {
            const reporters = violators[violatorID];
            const reporterList = reporters.map(reporter => toolNames[reporter]).join(' + ');
            // If it is the first or its reporters differ from those of the previous violator:
            if (reporterList !== currentReporterList) {
              // If it is not the first:
              if (currentReporterList) {
                // Close the previous violator list.
                dataLines.push('    </ul>');
              }
              currentReporterList = reporterList;
              // Add a heading for its reporters.
              dataLines.push(`    <h4>Reported by ${reporterList}</h4>`);
              // Start a list of the violators with those reporters.
              dataLines.push('    <ul>');
            }
            // Initialize the path ID and text fragments of the violator.
            let pathID = violatorID;
            let text = '';
            // If the violator ID is a catalog index:
            if (! violatorID.startsWith('html/')) {
              const catalogData = catalog[violatorID];
              // Correct the path ID.
              ({pathID} = catalogData);
              // If the violator has linkable text fragments:
              if (catalogData.isLinkableText) {
                // Correct the text fragments.
                ({text} = catalogData);
              }
            }
            // Initialize the list item as the path ID.
            let listItemContent = pathID;
            // If the element has linkable text fragments:
            if (text) {
              const fragmentList = text
              .split('\n')
              .map(fragment => fragmentEncode(fragment))
              .join(',');
              // Convert the list item to a link.
              listItemContent = `<a href="${url}:~:text=${fragmentList}">${pathID}</a>`;
            }
            // Add the element path ID, as a link if possible, to the list.
            dataLines.push(`      <li>${listItemContent}</li>`);
          });
        }
        // Close the final violator list.
        dataLines.push('    </ul>');
        // Close the issue details.
        dataLines.push('  </details>');
      });
      // Close the weight details.
      dataLines.push('</details>');
    }
  });
  // Add the lines to the query.
  query.data = dataLines.join(outerJoiner);
};
// Returns a report digest.
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
