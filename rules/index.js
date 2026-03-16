/*
  index.js
  Answers the issue-rules question.
*/

// IMPORTS

const {
  getWeightName,
  htmlSafe,
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

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
  lines.push(`${margin}<ul>`);
  // For each tool with any rules belonging to the issue:
  Object.keys(issues[issueID]).forEach(tool => {
    // Add a line.
    lines.push(`${margin}  <li><h3>${tool} rules</h3>`);
    lines.push(`${margin}    <ul>`);
    // For each rule of the tool belonging to the issue:
    issues[issueID][tool].forEach(ruleID => {
      const rule = issues[issueID][tool][ruleID];
      const {what} = rule;
      // Add facts about the rule.
      if (what === ruleID) {
        lines.push(`${margin}      <li>${ruleID}</li>`);
      }
      else {
        lines.push(`${margin}      <li>${ruleID}: ${htmlSafe(what)}</li>`);
      }
    });
    lines.push(`${margin}    </ul>`);
    lines.push(`${margin}  </li>`);
  });
  lines.push(`${margin}</ul>`);
  // Add the lines to the query.
  query.rules = lines.join('\n');
};
// Returns a page answering the violators question.
exports.answer = async issueID => {
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, query);
  // Get the template.
  let answerPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
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
