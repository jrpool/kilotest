/*
  index.js
  Discloses unclassified rules.
*/

// IMPORTS

const {getIssue, getReport, getTargetLogs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  const solos = {};
  const stillUnclassified = {};
  const nowClassified = {};
  // For each target:
  for (const targetLog of targetLogs) {
    const {jobName} = targetLog;
    // Get the latest report on it.
    const report = await getReport(... jobName.split('-'));
    const {acts} = report;
    // For each act in the report:
    acts.forEach(act => {
      const {result, type, which} = act;
      // If it is a test act with standard instances:
      if (type === 'test' && result?.standardResult?.instances?.length) {
        // For each standard instance:
        result.standardResult.instances.forEach(instance => {
          const {ruleID} = instance;
          // If its issue ID is missing:
          if (! instance.issueID) {
            // Get the issue ID of the rule.
            const issueID = getIssue(which, ruleID);
            // If the rule is now classified:
            if (issueID) {
              // Add the rule and the report to the rules that are now classified.
              nowClassified[which] ??= {};
              nowClassified[which][ruleID] ??= new Set();
              nowClassified[which][ruleID].add(jobName);
            }
            // Otherwise, i.e. if the rule is still unclassified:
            else {
              // Add the rule and the report to the rules that are still unclassified.
              stillUnclassified[which] ??= {};
              stillUnclassified[which][ruleID] ??= new Set();
              stillUnclassified[which][ruleID].add(jobName);
            }
          }
        });
      }
    });
  };
  const stillUnclassifiedLines = [];
  const nowClassifiedLines = [];
  const margin = ' '.repeat(6);
  // For each tool reporting any violations of still unclassified rules:
  Object.keys(stillUnclassified).forEach(toolID => {
    // For each such rule:
    Object.keys(stillUnclassified[toolID]).forEach(ruleID => {
      const reportIDs = Array.from(stillUnclassified[toolID][ruleID]);
      // Add a line to the lines on the rule.
      stillUnclassifiedLines.push(
        `${margin}<li>${toolID}: ${ruleID} (${reportIDs.join(', ')})</li>`
      );
    });
  });
  // Add the lines to the query.
  query.stillUnclassified = stillUnclassifiedLines.join('\n');
  // For each tool reporting any violations of now classified rules:
  Object.keys(nowClassified).forEach(toolID => {
    // For each such rule:
    Object.keys(nowClassified[toolID]).forEach(ruleID => {
      const reportIDs = Array.from(nowClassified[toolID][ruleID]);
      // Add a line to the lines on the rule.
      nowClassifiedLines.push(
        `${margin}<li>${toolID}: ${ruleID} (${reportIDs.join(', ')})</li>`
      );
    });
  });
  // Add the lines to the query.
  query.nowClassified = nowClassifiedLines.join('\n');
  if (nowClassifiedLines.length) {
    query.how = 'To update the assignment of instances to issues, submit your authorization code.';
    const formLines = [];
    formLines.push(`${margin}<form action="/reannotate.html" method="post">`);
    formLines.push(
      `${margin}  <p><label>Authorization code: <input size="3" minLength="3" maxlength="3" name="authCode" required></label></p>`
    );
    formLines.push(`${margin}  <p><button type="submit">Reannotate</button></p>`);
    formLines.push(`${margin}</form>`);
    query.reannotateForm = formLines.join('\n');
  }
};
// Returns a page disclosing newly classified rules and a form to reannotate reports.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
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
