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

// Encodes a string for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Adds parameters to a query for a digest.
const populateQuery = async (report, query) => {
  const {score, target, texts} = report;
  const {details} = score;
  const {url} = target;
  const {element, issue} = details;
  // Initialize an array of data on the reported issues.
  const issueData = [];
  // For each issue:
  Object.keys(issue).forEach(issueID => {
    const {summary, tools, wcag, weight} = issue[issueID];
    const issueToolNames = Object.keys(tools).map(toolID => toolNames[toolID]);
    const elementData = element[issueID];
    // Add data on it to the array.
    issueData.push({
      summary,
      wcag,
      weight,
      why: issues[issueID].why,
      issueToolNames,
      elementData
    });
  });
  // Initialize the HTML lines rendering the facts about the issues.
  const dataLines = [];
  const weightNames = ['Highest', 'High', 'Low', 'Lowest'];
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const weightIssues = issueData.filter(issueDatum => issueDatum.weight === weight);
    // If any issues of this weight were reported:
    if (weightIssues.length) {
      const weightName = weightNames[4 - weight];
      // Add a details element to the lines.
      dataLines.push('<details>');
      // Add the priority as a summary.
      dataLines.push(`  <summary><h3 class="priority">${weightName} priority</h3></summary>`);
      // Sort the issue data alphabetically by summary.
      weightIssues.sort((a, b) => a.summary.localeCompare(b.summary, {sensitivity: 'base'}));
      // Then sort the issue data in order of decreasing count of reporting tools.
      weightIssues.sort((a, b) => b.issueToolNames.length - a.issueToolNames.length);
      // For each issue:
      weightIssues.forEach(issueDatum => {
        const {elementData, issueToolNames, summary, wcag} = issueDatum;
        // Add a summary and expandable details to the lines.
        dataLines.push('  <details>');
        dataLines.push(`    <summary>${summary}</summary>`);
        dataLines.push(`    <p>Why it matters: ${issueDatum.why}</p>`);
        if (wcag) {
          dataLines.push(`    <p>Related WCAG standard: ${wcag}</p>`);
        }
        const toolCount = issueToolNames.length;
        const toolNameList = issueToolNames.join(' + ');
        if (toolCount > 1) {
          dataLines.push(`    <p>Reported by ${toolCount} tools (${toolNameList})</p>`);
        } else {
          dataLines.push(`    <p>Reported by 1 tool (${toolNameList})</p>`);
        }
        // If any elements were reported as exhibiting the issue:
        if (elementData && Object.keys(elementData).length) {
          let elementToolLists = Object.keys(elementData).sort();
          elementToolLists = elementToolLists.sort(
            (a, b) => b.split(/ \+ /).length - a.split(/ \+ /).length
          );
          // Add lines reporting which tools reported which elements as doing so.
          dataLines.push('    <p>Where reported:');
          // For each tool combination:
          elementToolLists.forEach(elementToolList => {
            const elementToolIDs = elementToolList.split(/ \+ /);
            const elementToolNameList = elementToolIDs.map(toolID => toolNames[toolID]).join(' + ');
            dataLines.push('    <ul class="whereList">');
            const toolCount = elementToolIDs.length;
            const elementCount = elementData[elementToolList].length;
            const inWhat = elementCount > 1 ? `${elementCount} elements` : '1 element';
            const byWhat = toolCount > 1 ? `${toolCount} tools` : '1 tool';
            dataLines.push(`      <li>Reported in ${inWhat} by ${byWhat} (${elementToolNameList}):`);
            dataLines.push('        <ul class="xPathList">');
            // For each XPath of an element reported by the combination for the issue:
            elementData[elementToolList].forEach(xPath => {
              const elementTexts = texts[xPath];
              const unanimousText = elementTexts.unanimous;
              // If the XPath has a unanimous text:
              if (unanimousText) {
                const fragment = unanimousText.length === 2
                ? `${fragmentEncode(unanimousText[0])},${fragmentEncode(unanimousText[1])}`
                : `${fragmentEncode(unanimousText[0])}`;
                // Add the XPath as a link to the text as a text fragment.
                dataLines.push(
                  `          <li><a href="${url}#:~:text=${fragment}">${xPath}</a></li>`
                );
              }
              // Otherwise, i.e. if the XPath has no unanimous text:
              else {
                // Add the XPath as a plain list item.
                dataLines.push(`          <li>${xPath}</li>`);
              }
            });
            dataLines.push('        </ul>');
            dataLines.push('      </li>');
            dataLines.push('    </ul>');
          });
        }
        dataLines.push('  </details>');
      });
      dataLines.push('</details>');
    }
  });
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
