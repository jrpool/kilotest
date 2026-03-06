/*
  classify.js
  Classifies tool rules by issue.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// Compiles a directory of the issue classifications of invariant and variable rules.
const getRuleIDs = () => {
  // Initialize data on invariant and variable rule IDs.
  const invariant = {};
  const variable = {};
  // Initialize a validity checker.
  const validityChecker = {};
  // For each classified issue:
  Object.keys(issues).forEach(issueID => {
    const {tools, weight} = issues[issueID];
    // If the weight is invalid:
    if (weight < 1 || weight > 4) {
      // Report this.
      console.log(`ERROR: Issue ${issueID} weight is invalid`);
    }
    // For each tool that has any rules belonging to the issue:
    Object.keys(tools).forEach(toolID => {
      // For each such rule:
      Object.keys(tools[toolID]).forEach(ruleID => {
        // If it is a duplicate:
        if (validityChecker[toolID]?.has(ruleID)) {
          // Report this.
          console.log(`ERROR: Rule ${ruleID} of tool ${toolID} belongs to 2 issues`);
        }
        // Otherwise, i.e. if it is not a duplicate:
        else {
          // Add it to the classified rules of the tool.
          validityChecker[toolID] ??= new Set();
          validityChecker[toolID].add(ruleID);
        }
        const rule = tools[toolID][ruleID];
        // If it is variable:
        if (rule.variable) {
          variable[toolID] ??= {};
          // Add its ID and the issue ID to the variable rule IDs.
          variable[toolID][ruleID] = issueID;
        }
        // Otherwise, i.e. if it is invariant:
        else {
          invariant[toolID] ??= {};
          // Add its ID and the issue ID to the invariant rule IDs.
          invariant[toolID][ruleID] = issueID;
        }
      });
    });
  });
  // Return the data.
  return {
    invariant,
    variable
  };
};
// Returns the non-ignorable issue that a rule belongs to.
exports.getIssue = (toolID, ruleID) => {
  const ruleIDs = getRuleIDs();
  const {invariant, variable} = ruleIDs;
  // Initialize the issue ID of the rule as if the rule ID is invariant.
  let issueID = invariant[toolID]?.[ruleID];
  // If the initialization succeeded and the issue ID is not ignorable:
  if (issueID && issueID !== 'ignorable') {
    // Return it.
    return issueID;
  }
  // Otherwise, i.e. if the initialization failed:
  else {
    // Change the rule ID to the first matching variable rule ID of the tool.
    ruleID = Object
    .keys(variable[toolID] ?? {})
    .find(variableRuleID => new RegExp(variableRuleID).test(ruleID));
    // If the change succeeded:
    if (ruleID) {
      // Reassign the issue ID as that of the variable rule.
      issueID = variable[toolID][ruleID];
    }
    // If the issue ID is ignorable or was not found:
    if (issueID == 'ignorable' || ! issueID) {
      // Return blank.
      return '';
    }
    // Otherwise, i.e. if it was found and is not ignorable:
    else {
      // Return it
      return issueID;
    }
  }
};
// Annotates the standard instances of a report with issue IDs.
exports.annotateReport = async (timeStamp, jobID) => {
  // Get a copy of the report.
  const reportJSON = await fs.readFile(`./reports/${timeStamp}-${jobID}.json`, 'utf8');
  const report = JSON.parse(reportJSON);
  // For each of its acts:
  for (const act of report.acts) {
    // If it is a test act:
    if (act.type === 'test') {
      // For each standard instance of the result:
      for (const instance of act.result?.standardResult?.instances ?? []) {
        const {ruleID} = instance;
        // Classify its rule.
        const issueID = getIssue(ruleID);
        // If the classification succeeded:
        if (issueID) {
          // Add the issue ID to the instance.
          instance.issueID = issueID;
        }
      }
    }
  }
  // Save the annotated report.
  await fs.writeFile(
    `./reports/${timeStamp}-${jobID}.json`, `${JSON.stringify(report, null, 2)}\n`
  );
  // Get a copy of the log of the report.
  const logJSON = await fs.readFile(`./logs/${timeStamp}-${jobID}.json`, 'utf8');
  const log = JSON.parse(logJSON);
  // Annotate the log to mark the report as annotated.
  log.annotated = true;
  // Save the annotated log.
  await fs.writeFile(`./logs/${timeStamp}-${jobID}.json`, `${JSON.stringify(log, null, 2)}\n`);
};
