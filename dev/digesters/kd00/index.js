/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// IMPORTS

require('dotenv').config();
const fs = require('fs/promises');
const {getTally} = require('../../../tally');

// CONSTANTS

// Newline with indentations.
const outerJoiner = '\n      ';
const weightNames = ['Highest', 'High', 'Low', 'Lowest'];

// FUNCTIONS

// Encodes a string for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {catalog, target} = report;
  const {url} = target;
  // Get a tally of classified issues and violators.
  const tally = getTally(report);
  // Initialize the HTML lines rendering facts about the issues.
  const lines = [];
  // For each classified issue with any violations:
  tally.forEach((weightData, index) => {
    const {issues} = weightData;
    const weightName = weightNames[index];
    // Add a details element to the lines for the weight.
    lines.push('<details>');
    // Add the weight name as a summary.
    lines.push(`  <summary><h3 class="priority">${weightName} priority</h3></summary>`);
    // For each issue of the weight with any violations:
    issues.forEach(issue => {
      const {ensembles, reporters, summary, violators, wcag, why} = issue;
      // Add issue details, a summary, an impact, and a related WCAG standard to the lines.
      dataLines.push('  <details>');
      dataLines.push(`    <summary>${summary}</summary>`);
      dataLines.push(`    <p>Why it matters: ${why}</p>`);
      if (wcag) {
        dataLines.push(`    <p>Related WCAG standard: ${wcag}</p>`);
      }
      const reporterCount = reporters.length;
      const reporterList = reporters.join(' + ');
      // Add the names and a count of issue reporters to the lines.
      if (reporterCount > 1) {
        dataLines.push(`    <p>Reported by ${reporterCount} tools (${reporterList})</p>`);
      } else {
        dataLines.push(`    <p>Reported by 1 tool (${reporterList})</p>`);
      }
      // For each ensemble of reporters:
      ensembles.forEach(ensemble => {
        // Add ensemble details, a summary, and violator references to the lines.
        dataLines.push('    <details>');
        const {id, reporters} = ensemble;
        if (ensemble.reporters.length > 1) {
          dataLines.push(`      <summary>Reported by ${reporters.length} tools (${ensemble.reporters.join(' + ')})</summary>`);
        } else {
          dataLines.push(`      <summary>Reported by 1 tool (${reporters[0]})</summary>`);
        }
        dataLines.push(`      <p>Reported by ${reporters.length} tools</p>`);
        violators.forEach(violator => {
          const {id} = violator;
          if (id.startsWith('html/')) {
            dataLines.push(`      <p>${id}</p>`);
          }
          else {
            const catalogData = catalog[id];
            const {isLinkableText, pathID, text} = catalogData;
            if (isLinkableText) {
              const fragmentList = text
              .split('\n')
              .map(fragment => fragmentEncode(fragment))
              .join(',');
              dataLines.push(`      <p><a href="${url}:~:text=${fragmentList}">${pathID}</a></p>`);
            }
            else {
              dataLines.push(`      <p>${pathID}</p>`);
            }
          }
        })
        dataLines.push('    </details>');
      });
      // Close the issue details.
      dataLines.push('  </details>');
    });
    // Close the weight details.
    dataLines.push('</details>');
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
