/*
  index.js
  Answers the issue-rules question.
*/

// IMPORTS

const {
  getWeightName,
  htmlSafe,
  tools
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (issueID, query) => {
  // Add facts about the issue to the query.
  query.issue = issues[issueID].summary;
  const issue = issues[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = wcag;
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each tool with any rules belonging to the issue:
  Object.keys(issue.tools).forEach(toolID => {
    // Add a line.
    lines.push(`${margin}<li><h3>${tools[toolID][0]} rules</h3>`);
    lines.push(`${margin}  <ul>`);
    const tool = issue.tools[toolID];
    // For each rule of the tool belonging to the issue:
    Object.keys(tool).forEach(ruleID => {
      const rule = tool[ruleID];
      const {what} = rule;
      // Add facts about the rule.
      if (what === ruleID) {
        lines.push(`${margin}    <li><code>${htmlSafe(ruleID)}</code></li>`);
      }
      else {
        lines.push(`${margin}    <li><code>${htmlSafe(ruleID)}</code>: ${htmlSafe(what)}</li>`);
      }
    });
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`);
  });
  // Add the lines to the query.
  query.rules = lines.join('\n');
};
// Returns a page answering the violators question.
exports.answer = async issueID => {
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, query);
  // Get the template.
  let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  // Replace its placeholders.
  Object.keys(query).forEach(param => {
    answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
  });
  // Return the populated page.
  return {
    status: 'ok',
    answerPage
  };
};
