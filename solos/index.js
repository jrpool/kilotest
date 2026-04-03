/*
  index.js
  Discloses unclassified rules.
*/

// IMPORTS

const {getReport, getTargetLogs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  const solos = {};
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
          // If its rule is unclassified:
          if (! instance.issueID) {
            solos[which] ??= {};
            solos[which][instance.ruleID] ??= new Set();
            // Add the report to the reports in which the rule is violated.
            solos[act.which][instance.ruleID].add(jobName);
          }
        });
      }
    });
  };
  const soloLines = [];
  const margin = ' '.repeat(6);
  // For each tool reporting any violations of unclassified rules:
  Object.keys(solos).forEach(toolID => {
    // For each such rule:
    Object.keys(solos[toolID]).forEach(ruleID => {
      const reportIDs = Array.from(solos[toolID][ruleID]);
      // Add a line to the lines on the rule.
      soloLines.push(`${margin}<li>${toolID}: ${ruleID} (${reportIDs.join(', ')})</li>`);
    });
  });
  // Add the lines to the query.
  query.rules = soloLines.join('\n');
};
// Returns a page disclosing unclassified rules.
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
