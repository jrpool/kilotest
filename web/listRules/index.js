/*
  index.js
  List the rules belonging to an issue.
*/

// IMPORTS

const {
  getWeightName,
  htmlSafe,
  ruleEngines
} = require('../../util');
const {issues: issueSpecs, issueRules, rules: ruleSpecs} = require('testaro-issues');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (issueID, query) => {
  // Add facts about the issue to the query.
  query.issue = issueSpecs[issueID]?.summary;
  if (!query.issue) {
    query.error = 'Issue not found';
    return;
  }
  const issue = issueSpecs[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = wcag;
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each rule engine with any rules belonging to the issue:
  Object.keys(issueRules[issueID] ?? {}).forEach(engineID => {
    // Add a heading for the rules of the rule engine.
    lines.push(`${margin}<h3>${ruleEngines[engineID][0]} rules</h3>`);
    const {invariant, variable} = issueRules[issueID][engineID];
    const rulesByType = {
      invariant,
      variable
    };
    // For each rule variability:
    Object.keys(rulesByType).forEach(typeName => {
      // If any rules of the rule engine belonging to the issue have it:
      if (rulesByType[typeName].length) {
        // Add a heading for them.
        lines.push(`${margin}<h4>${typeName} rules</h4>`);
        // Add a list of facts about them.
        lines.push(`${margin}<ul>`);
        rulesByType[typeName].forEach(ruleID => {
          const {what} = ruleSpecs[engineID][typeName][ruleID];
          if (what === ruleID) {
            lines.push(`${margin}  <li><code>${htmlSafe(ruleID)}</code></li>`);
          }
          else {
            lines.push(`${margin}  <li><code>${htmlSafe(ruleID)}</code>: ${htmlSafe(what)}</li>`);
          }
        });
        lines.push(`${margin}</ul>`);
      }
    });
  });
  // Add the lines to the query.
  query.rules = lines.join('\n');
};
// Returns a page answering the issue-rules question.
exports.answer = async issueID => {
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, query);
  // If this succeeded:
  if (query.issue) {
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
  }
  // Otherwise, i.e. if it failed, report this.
  return {
    status: 'error',
    message: query.error
  };
};
