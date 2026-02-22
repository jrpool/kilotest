/*
  tally.js
  Adds violation data to issues.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');

// Compiles an array of variable rule IDs.
const getRuleIDs = () => {
  // Initialize data on invariant and variable rule IDs.
  const invariantRuleIDs = {};
  const variableRuleIDs = {};
  // For each classified issue:
  Object.keys(issues).forEach(issueID => {
    const tools = issues[issueID];
    // For each tool that has any rules belonging to the issue:
    Object.keys(tools).forEach(toolID => {
      // For each such rule:
      Object.keys(tools[toolID]).forEach(ruleID => {
        const rule = tools[toolID][ruleID];
        // If it is variable:
        if (rule.variable) {
          variableRuleIDs[toolID] ??= [];
          // Add it to the data.
          variableRuleIDs[toolID].push(ruleID);
        }
        // Otherwise, i.e. if it is invariant:
        else {
          invariantRuleIDs[toolID] ??= [];
          // Add it to the data.
          invariantRuleIDs[toolID].push(ruleID);
        }
      });
    });
  });
  // Return the data.
  return {
    invariantRuleIDs,
    variableRuleIDs
  };
};
// Adds violation data to a rule classifier.
exports.tally = report => {
  // Get data on the variable classified rules.
  const ruleIDs = getRuleIDs();
  const {acts} = report;
  // Initialize data on the standard instances of classified rules.
  const ruleInstances = {};
  // For each act in the report:
  acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const toolID = act.which;
      ruleInstances[toolID] ??= {};
      const {instances} = act.result.standardResult ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        // Initialize the rule ID of the instance as if invariant.
        let {ruleID} = instance;
        // If that invariant rule ID does not exist:
        if (! ruleIDs.invariantRuleIDs[ruleID]) {
          // Change the rule ID to the first variable rule ID of the tool that it matches.
          ruleID = ruleIDs
          .variableRuleIDs[toolID]
          ?.find(variableRuleID => variableRuleID.test(ruleID));
        }
        // If a classified rule has an ID that is or matches that of the instance:
        if (ruleID) {
          ruleInstances[toolID][ruleID] ??= [];
          // Add the instance to the data.
          ruleInstances[toolID][ruleID].push(instance);
        }
      });
    }
  });
  // Get the IDs of the classified issues in alphabetical order of their summaries.
  const issueIDs = Object.keys(issues).sort(
    (a, b) => issues[a].summary.localeCompare(issues[b].summary)
  );
  // For each classified issue in that order:
  issueIDs.forEach(issueID => {
    const issue = issues[issueID];
    // Initialize the violation count of the issue.
    issue.count ??= 0;
    // Initialize data on the reporters and violators of rules belonging to the issue.
    issue.reporters ??= new Set();
    issue.violators ??= {};
    const {tools, violators} = issue;
    // For each tool that has any rules belonging to the issue:
    Object.keys(tools).forEach(toolID => {
      // For each such rule:
      Object.keys(tools[toolID]).forEach(ruleID => {
        const instances = ruleInstances[toolID][ruleID] ?? [];
        // For each instance of a violation of that rule:
        instances.forEach(instance => {
          const {catalogIndex, count, pathID} = instance;
          const instanceCount = count ?? 1;
          // Add its count to that of the issue.
          issue.count += instanceCount;
          // Include the tool among those reporting the issue.
          issue.reporters.add(toolID);
          // If the instance discloses a catalog index:
          if (catalogIndex) {
            violators[catalogIndex] ??= new Set();
            // Include the tool among those reporting the violator.
            violators[catalogIndex].add(toolID);
          }
          // Otherwise, if the instance discloses a path ID:
          else if (pathID) {
            violators[pathID] ??= new Set();
            // Include the tool among those reporting the violator.
            violators[pathID].add(toolID);
          }
          // Convert the set of IDs of tools reporting the issue to a sorted array.
          issue.reporters = Array.from(issue.reporters).sort();
          // For each violator (identified by its catalog index or path ID):
          Object.keys(violators).forEach(violatorID => {
            // Convert the set of IDs of tools reporting it to a sorted array.
            violators[violatorID] = Array.from(violators[violatorID]).sort();
          });
          // Convert the violators object to a sorted array of identifier-tools arrays.
          issue.violators = Object
          .entries(violators)
          .sort((a, b) => a[1].join('+').localeCompare(b[1].join('+')))
          .sort((a, b) => b[1].length - (a[1].length));
        });
      });
    });
  });
  // Return the augmented classification.
  return issues;
};
