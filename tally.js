/*
  tally.js
  Adds violation data to issues.

  The issues object imported from testilo/procs/score/tic has this structure:

  lineHeightAbsolute: {
    summary: 'line height absolute',
    why: 'User cannot adjust the line height of text for readability',
    wcag: '1.4.12',
    weight: 2,
    tools: {
      alfa: {
        r80: {
          variable: false,
          quality: 1,
          what: 'Paragraph text has an absolute line height'
        }
      }
    }
  }

  The getTally function returns a 4-item array with this structure:

  [
    {
      weight: 4,
      issues: [
        {
          issueID: 'lineHeightAbsolute',
          summary: 'line height absolute',
          why: 'User cannot adjust the line height of text for readability',
          wcag: '1.4.12',
          violatorCount: 34,
          reporters: [
            'alfa',
            'axe',
            'htmlcs',
            'wave'
          ],
          violators: [
            {
              reporters: [
                'alfa',
                'axe',
                'htmlcs',
                'wave'
              ],
              violators: [
                'html/body/div[1]/svg[1]'
                'html/body/div[1]/noscript[3]',
                '318',
                '29'
              ]
            },
            {
              reporters: [
                'htmlcs',
                'wave'
              ],
              violators: [
                '44'
              ]
            }
          ]
        },
        {
          issueID: 'imageNoText',
          …
        }
      ]
    },
    {
      weight: 3,
      issues: [
        …
      ]
    },
    …
  ]

  In the returned array, the 4 items are data on issues of weights 4, 3, 2, and 1, in that order. In each of those items, the objects in the issues array are data on issues with the weight of the item whose counts are positive. The reporters array in each issue object is an array of the IDs of the tools that reported a violation of any rule belonging to the issue. tools that reported the issue. The violators object in each issue object is an object with the identifiers of the violators as keys and the tools that reported them as values.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');

// Compiles a directory of the issue classifications of invariant and variable rules.
const getRuleIDs = () => {
  // Initialize data on invariant and variable rule IDs.
  const invariant = {};
  const variable = {};
  // Initialize a conflict checker.
  const conflictChecker = {};
  // For each classified issue:
  Object.keys(issues).forEach(issueID => {
    const tools = issues[issueID];
    // For each tool that has any rules belonging to the issue:
    Object.keys(tools).forEach(toolID => {
      // For each such rule:
      Object.keys(tools[toolID]).forEach(ruleID => {
        // Check it for conflicts.
        if (conflictChecker[toolID]?.has(ruleID)) {
          throw new Error(`ERROR: Rule ${ruleID} of tool ${toolID} belongs to 2 issues`);
        }
        conflictChecker[toolID] ??= new Set();
        conflictChecker[toolID].add(ruleID);
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
// Returns data on violations of rules by issue weight and reporters.
exports.getTally = report => {
  // Initialize the tally.
  const tally = [];
  [4, 3, 2, 1].forEach(weight => {
    tally.push({
      weight,
      issues: {}
    });
  });
  // Get the invariant and variable classified rules with issue IDs.
  const ruleIDs = getRuleIDs();
  const {acts} = report;
  // For each act in the report:
  acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const toolID = act.which;
      const instances = act.result?.standardResult?.instances ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        // Initialize its rule ID.
        let {ruleID} = instance;
        let issueID = ruleIDs.invariant[toolID]?.[ruleID];
        // If its rule ID is not invariant:
        if (! issueID) {
          // Change the rule ID to the first matching variable rule ID of the tool.
          ruleID = ruleIDs
          .variable[toolID]
          ?.find(variableRuleID => variableRuleID.test(ruleID));
          issueID = ruleIDs.variable[toolID]?.[ruleID];
        }
        // If a classified rule has an ID that is or matches that of the instance:
        if (issueID) {
          const issue = issues[issueID];
          const weight = issue.weight;
          const weightIssues = tally[4 - weight].issues;
          // Add data on the instance to data on the issue in the tally.
          weightIssues[issueID] ??= issues[issueID];
          const issueData = weightIssues[issueID];
          issueData.count ??= 0;
          issueData.reporters ??= new Set();
          issueData.violators ??= {};
          const {count, reporters, violators} = issueData;
          const violatorID = instance.catalogIndex ?? instance.pathID;
          // If the instance discloses a catalog index or path ID:
          if (violatorID) {
            const violator = violators[violatorID];
            // If the violator is new for the issue:
            if (! violator) {
              // Add data on the violator to the issue data.
              count += instance.count ?? 1;
              reporters.add(toolID);
              violators[violatorID] = {
                reporters: new Set([toolID])
              };
            }
            // Otherwise, i.e. if the violator is not new for the issue:
            else {
              // Add data on the violator to the issue data.
              reporters.add(toolID);
              violator.reporters.add(toolID);
            }
          }
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
        const instances = ruleInstances[toolID]?.[ruleID] ?? [];
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
  // Return the classification with count, reporters, and violators properties added to each issue.
  return issues;
};
