/*
  tally.js
  Adds violation data to issues.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');

// Compiles an array of variable rule IDs.
const getVariableRuleIDs = () => {
  // Initialize data on variable rule IDs.
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
      });
    });
  });
  // Return the data.
  return variableRuleIDs;
};
// Adds violation data to a rule classifier.
exports.tally = report => {
  // Get data on the variable classified rules.
  const variableRuleIDs = getVariableRuleIDs();
  const {acts} = report;
  // Initialize data on the standard instances of classified rules.
  const ruleInstances = {};
  // For each act in the report:
  acts.forEach(act => {
    if (act.type === 'test') {
      const toolID = act.which;
      ruleInstances[toolID] ??= {};
      const {instances} = act.result.standardResult;
      // For each standard instance of the act:
      instances.forEach(instance => {
        // Initialize the rule ID of the instance as if invariant.
        let {ruleID} = instance;
        const rule = issues.tools[toolID][ruleID];
        // If no classified rule with that ID exists:
        if (! rule) {
          // Get the first variable rule ID of the tool that it matches.
          ruleID = variableRuleIDs[toolID]?.find(variableRuleID => variableRuleID.test(ruleID));
        }
        // If a classified rule has an ID that is or matches that of the instance:
        if (ruleID) {
          ruleInstances[toolID][ruleID] ??= [];
          // Add the instance to the directory.
          ruleInstances[toolID][ruleID].push(instance);
        }
      });
    }
  });
  // For each classified issue:
  Object.keys(issues).forEach(issueID => {
    const issue = issues[issueID];
    // Initialize the violation count of the issue.
    issue.count ??= 0;
    // Initialize data on the reported violators of rules belonging to the issue.
    issue.violators ??= {};
    const {violators} = issue;
    const {tools} = issue;
    // For each tool that has any rules belonging to the issue:
    Object.keys(tools).forEach(toolID => {
      // For each such rule:
      Object.keys(tools[toolID]).forEach(ruleID => {
        const instances = ruleInstances[toolID][ruleID] ?? [];
        // For each instance with that rule:
        instances.forEach(instance => {
          const {catalogIndex, count, pathID} = instance;
          const instanceCount = instance.count ?? 1;
          // Add its count to that of the issue.
          issue.count += instanceCount;
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
        });
      });
    });
  });
  // Return the augmented classification.
  return issues;
};
