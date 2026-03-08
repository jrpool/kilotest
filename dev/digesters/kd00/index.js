/*
  © 2025 Jonathan Robert Pool. All rights reserved.
  Licensed under the MIT License. See LICENSE file for details.
*/

// IMPORTS

require('dotenv').config();
const fs = require('fs/promises');
const {getTally} = require('../../../util');

// CONSTANTS

// Newline with indentations.
const outerJoiner = '\n      ';
const weightNames = ['Highest', 'High', 'Low', 'Lowest'];

// FUNCTIONS

// Encodes a string for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Encodes a string for use as an HTML text node.
const htmlEncode = string => {
  return string
    .replace(/&/g, '&amp')
    .replace(/</g, '&lt')
    .replace(/>/g, '&gt')
    .replace(/"/g, '&quot')
    .replace(/'/g, '&apos');
};
// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {catalog, target} = report;
  const {url} = target;
  // Get a tally of classified issues and violators.
  const tally = getTally(report);
  // Initialize the HTML lines rendering facts about the issues.
  const lines = [];
  const {issueCount, reporterCount, reporters} = tally;
  // Add the count of issues to the lines.
  lines.push(`<p>Count of issues: ${issueCount}</p>`);
  // Add the reporter count and list to the lines.
  const reporterCountString = reporterCount > 1 ? `${reporterCount} tools` : '1 tool';
  lines.push(`<p>Tools reporting issues: ${reporterCountString} (${reporters.join(' + ')})</p>`);
  // Add an external-links notice to the lines.
  lines.push(
    `<p>Notice: To preserve this page, each link opens in a new tab. Close it to return here.</p>`
  );
  // For each weight:
  tally.weights.forEach((weightData, index) => {
    const weightName = weightNames[index];
    const {issues} = weightData;
    // Add a details element to the lines for the weight.
    lines.push('<details>');
    const issueCountString = issues.length > 1 ? `${issues.length} issues` : '1 issue';
    // Add the weight name and its issue count as a summary.
    lines.push(
      `  <summary><h3 class="priority">${weightName} priority (${issueCountString})</h3></summary>`
    );
    // For each issue of the weight with any violations:
    issues.forEach(issue => {
      const {ensembles, reporterCount, reporters, summary, wcag, why} = issue;
      // Add issue details, a summary, an impact, and a related WCAG standard to the lines.
      lines.push('  <details>');
      lines.push(`    <summary><h4 class="priority">${summary}</h4></summary>`);
      lines.push(`    <p>Why it matters: ${why}</p>`);
      if (wcag) {
        lines.push(`    <p>Related WCAG standard: ${wcag}</p>`);
      }
      const reporterList = reporters.join(' + ');
      // Add the names and a count of issue reporters to the lines.
      if (reporterCount > 1) {
        lines.push(`    <p>Reported by ${reporterCount} tools (${reporterList})</p>`);
      } else {
        lines.push(`    <p>Reported by 1 tool (${reporterList})</p>`);
      }
      // For each ensemble of reporters:
      ensembles.forEach(ensemble => {
        const {reporters, violators} = ensemble;
        if (reporters.length > 1) {
          lines.push(
            `    <h5>Elements reported by ${reporters.length} tools (${reporters.join(' + ')})</h5>`
          );
        } else {
          lines.push(`    <h5>Elements reported by 1 tool (${reporters[0]})</h5>`);
        }
        // For each violator reported by the ensemble:
        violators.forEach(violatorID => {
          // If the violator ID is a path ID:
          if (violatorID.startsWith('html/')) {
            // Add the path ID to the lines.
            lines.push(`    <p>${violatorID}</p>`);
          }
          // Otherwise, i.e. if it is a catalog index:
          else {
            const catalogData = catalog[violatorID];
            const {textLinkable, pathID, text} = catalogData;
            const textString = text ? ` (${htmlEncode(text
            .replace(/\n/, ' … ')
            .slice(0, 35)
            .concat(text.length > 35 ? ' …' : ''))})` : '';
            const entryString = `${pathID}${textString}`;
            // If the catalog entry contains a linkable non-code text:
            if (textLinkable && ! text.includes('&')) {
              const fragmentList = text
              .split('\n')
              .map(fragment => fragmentEncode(fragment))
              .join(',');
              // Add the path ID and inner text as a text-fragment link to the lines.
              lines.push(
                `    <p><a href="${url}#:~:text=${fragmentList}" target="_blank">${entryString}</a></p>`
              );
            }
            // Otherwise, i.e. if it does not contain a linkable text:
            else {
              // Add the path ID and inner text to the lines.
              lines.push(`    <p>${entryString}</p>`);
            }
          }
        })
      });
      // Close the issue details element.
      lines.push('  </details>');
    });
    // Close the weight details element.
    lines.push('</details>');
  });
  // Add the lines to the query.
  query.data = lines.join(outerJoiner);
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
