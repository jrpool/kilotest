/*
  index.js
  Discloses unclassified rules.
*/

// IMPORTS

const {getIssue, getReport, getLogs, ruleIDs} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = (await getLogs()).filter(log => ! log.superseded);
  const stillUnclassified = {};
  const reClassified = {};
  // For each target:
  for (const targetLog of targetLogs) {
    const {jobName = '-'} = targetLog;
    // Get the latest report on it.
    const report = await getReport(... jobName.split('-'));
    const {acts = [], error} = report;
    // If this failed:
    if (error) {
      // Populate the query with the reason.
      query.error = error;
      // Stop populating the query.
      return;
    }
    // Otherwise, i.e. if it succeeded, for each act in the report:
    acts.forEach(act => {
      const {result, type, which} = act;
      // If it is a test act with standard instances:
      if (type === 'test' && result?.standardResult?.instances?.length) {
        // For each standard instance:
        result.standardResult.instances.forEach(instance => {
          const {ruleID} = instance;
          // Get the issue ID of the rule, or null if none.
          const issueID = getIssue(ruleIDs, which, ruleID);
          // If the issue ID of the instance differs from that of the rule:
          if ((instance.issueID || null) !== issueID) {
            // Add the rule and the report to the rules with changed issue IDs.
            reClassified[which] ??= {};
            reClassified[which][ruleID] ??= new Set();
            reClassified[which][ruleID].add(jobName);
          }
          // Otherwise, if the instance and the rule both have no issue ID:
          else if (! issueID){
            // Add the rule and the report to the rules that are still unclassified.
            stillUnclassified[which] ??= {};
            stillUnclassified[which][ruleID] ??= new Set();
            stillUnclassified[which][ruleID].add(jobName);
          }
        });
      }
    });
  };
  const stillUnclassifiedLines = [];
  const reClassifiedLines = [];
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
  // For each tool reporting any discrepancies in rule classification:
  Object.keys(reClassified).forEach(toolID => {
    // For each such rule:
    Object.keys(reClassified[toolID]).forEach(ruleID => {
      const reportIDs = Array.from(reClassified[toolID][ruleID]);
      // Add a line to the lines on the rule.
      reClassifiedLines.push(
        `${margin}<li>${toolID}: ${ruleID} (${reportIDs.join(', ')})</li>`
      );
    });
  });
  // Add the lines to the query.
  query.reClassified = reClassifiedLines.join('\n');
  if (reClassifiedLines.length) {
    query.how = 'Each <q>reclassified</q> rule indicates that report annotations are out of date. To update them, submit your authorization code.';
    const formLines = [];
    formLines.push(`${margin}<form action="/reannotate.html" method="post">`);
    formLines.push(
      `${margin}  <p><label>Authorization code: <input size="3" minLength="3" maxlength="3" name="authCode" required></label></p>`
    );
    formLines.push(`${margin}  <p><button type="submit">Reannotate</button></p>`);
    formLines.push(`${margin}</form>`);
    query.reannotateForm = formLines.join('\n');
  }
  else {
    query.how = 'No violated rules have been classified or reclassified after being reported, so reannotation of the reports is not necessary.';
    query.reannotateForm = '';
  }
};
// Returns a page disclosing newly classified rules and a form to reannotate reports.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
  // If the query reports an error:
  if (query.error) {
    // Return the error.
    return {
      status: 'error',
      message: query.error
    };
  }
  // Otherwise, i.e. if the query does not report an error, get the template.
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
