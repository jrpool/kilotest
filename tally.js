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

  The getTally function returns an object with this structure:

  {
    issueCount: 88,
    reporterCount: 4,
    reporters: [
      'alfa',
      'axe',
      'htmlcs',
      'wave'
    ],
    weights: [
      {
        weight: 4,
        issues: [
          {
            issueID: 'lineHeightAbsolute',
            summary: 'line height absolute',
            why: 'User cannot adjust the line height of text for readability',
            wcag: '1.4.12',
            violatorCount: 34,
            reporterCount: 4,
            reporters: [
              'alfa',
              'axe',
              'htmlcs',
              'wave'
            ],
            ensembles: [
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
      }
    ]
  }

  In the returned array, the 4 items are data on issues of weights 4, 3, 2, and 1, in that order. In each of those items, the objects in the issues array are data on issues with the weight of the item whose counts are positive. The reporters array in each issue object is an array of the IDs of the tools that reported a violation of any rule belonging to the issue. tools that reported the issue. The violators object in each issue object is an object with the identifiers of the violators as keys and the tools that reported them as values.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');
const toolNames = require('testaro/procs/job').tools;

// Compiles a directory of the issue classifications of invariant and variable rules.
const getRuleIDs = () => {
  // Initialize data on invariant and variable rule IDs.
  const invariant = {};
  const variable = {};
  // Initialize a conflict checker.
  const conflictChecker = {};
  // For each classified issue:
  Object.keys(issues).forEach(issueID => {
    // If the issue is not deprecated:
    if (issueID !== 'ignorable') {
      const {tools} = issues[issueID];
      // For each tool that has any rules belonging to the issue:
      Object.keys(tools).forEach(toolID => {
        // For each such rule:
        Object.keys(tools[toolID]).forEach(ruleID => {
          // If it is a duplicate:
          if (conflictChecker[toolID]?.has(ruleID)) {
            // Report this.
            console.log(`ERROR: Rule ${ruleID} of tool ${toolID} belongs to 2 issues`);
          }
          // Otherwise, i.e. if it is not a duplicate:
          else {
            // Add it to the classified rules of the tool.
            conflictChecker[toolID] ??= new Set();
            conflictChecker[toolID].add(ruleID);
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
    }
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
  const tally = {
    issueCount: 0,
    reporterCount: 0,
    reporters: [],
    weights: []
  };
  [4, 3, 2, 1].forEach(weight => {
    tally.weights.push({
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
        // Initialize the issue ID of the rule.
        let issueID = ruleIDs.invariant[toolID]?.[ruleID];
        // If the rule ID is not invariant:
        if (! issueID) {
          // Change the rule ID to the first matching variable rule ID of the tool.
          ruleID = Object
          .keys(ruleIDs.variable[toolID] ?? {})
          .find(variableRuleID => new RegExp(variableRuleID).test(ruleID));
          // Reassign the issue ID as that of the variable rule.
          issueID = ruleIDs.variable[toolID]?.[ruleID];
        }
        // If a classified rule has an ID that is or matches that of the instance:
        if (issueID) {
          const issue = issues[issueID];
          const {weight} = issue;
          const weightIssues = tally.weights[4 - weight].issues;
          // Add data on the instance to data on the issue in the tally.
          weightIssues[issueID] ??= issues[issueID];
          const issueData = weightIssues[issueID];
          issueData.count ??= 0;
          issueData.reporters ??= new Set();
          issueData.violators ??= {};
          let {count} = issueData;
          const {reporters, violators} = issueData;
          const violatorID = instance.catalogIndex ?? instance.pathID;
          const violator = violators[violatorID];
          // Ensure that the tool is included in the reporters of the issue.
          reporters.add(toolID);
          // If the instance discloses a catalog index or path ID:
          if (violatorID) {
            // If the violator has already been reported for the issue:
            if (violator) {
              // Ensure that the tool is included in the reporters of the violator.
              violator.reporters.add(toolID);
            }
            // Otherwise, i.e. if the violator is new for the issue:
            else {
              // Add data on the violator to the issue data.
              count += instance.count ?? 1;
              violators[violatorID] = {
                reporters: new Set([toolID])
              };
            }
          }
          // Otherwise, i.e. if the instance does not disclose a catalog index or path ID:
          else {
            // Ensure that the tool is included in the reporters of the issue.
            reporters.add(toolID);
          }
        }
      });
    }
  });
  // Initialize sets of reported issues and reporters.
  const reportedIssues = new Set();
  const reporters = new Set();
  // For each weight:
  [4, 3, 2, 1].forEach(weight => {
    const weightIssues = tally.weights[4 - weight].issues;
    // Initialize an array to replace the issues object in the tally.
    const issueArray = [];
    // For each issue with the weight:
    Object.keys(weightIssues).forEach(issueID => {
      // Ensure that the issue is included in the reported issues.
      reportedIssues.add(issueID);
      const issueData = weightIssues[issueID];
      // For each reporter of the issue:
      issueData.reporters.forEach(reporter => {
        // Ensure that the reporter is included in the reporters.
        reporters.add(reporter);
      });
      const issue = issues[issueID];
      const {summary, wcag, why} = issue;
      // Initialize an item to be added to the array.
      const issueItem = {
        issueID,
        summary,
        why,
        wcag,
        violatorCount: issueData.count,
        reporterCount: issueData.reporters.size,
        reporters: Array.from(issueData.reporters).map(toolID => toolNames[toolID]).sort()
      };
      // Initialize an array of data on the violators of any rule belonging to the issue.
      const violators = [];
      // Initialize a set of ensemble-describing strings.
      const ensembles = new Set();
      // For each violator of any rule belonging to the issue:
      Object.keys(issueData.violators).forEach(violatorID => {
        // Get a string describing the ensemble of its reporters.
        const ensembleString = Array
        .from(issueData.violators[violatorID].reporters)
        .map(toolID => toolNames[toolID])
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .join(' + ');
        // Ensure that the ensemble string is in the set.
        ensembles.add(ensembleString);
        // Add data on the violator to the array.
        violators.push({
          id: violatorID,
          ensembleString
        });
      });
      // Sort the data on the violators by violator ID.
      violators.sort((a, b) => a.id.localeCompare(b.id));
      // Initialize an array of the ensembles sorted alphabetically.
      ensembleArray = Array.from(ensembles).sort();
      // Sort the sorted array by decreasing ensemble size.
      ensembleArray.sort((a, b) => b.split(' + ').length - a.split(' + ').length);
      // Add an array of ensemble data to the the issue item.
      issueItem.ensembles = ensembleArray.map(ensembleString => ({
        reporters: ensembleString.split(' + '),
        violators: violators
        .filter(violator => violator.ensembleString === ensembleString)
        .map(violator => violator.id)
      }));
      // Add the issue item to the issue array.
      issueArray.push(issueItem);
    });
    // Sort the items in the issue array by decreasing reporter count.
    issueArray.sort((a, b) => b.reporterCount - a.reporterCount);
    // Replace the issues object for the weight in the tally with the issue array.
    tally.weights[4 - weight].issues = issueArray;
  });
  // Add the issue count, reporter count, and reporter list to the tally.
  tally.issueCount = reportedIssues.size;
  tally.reporterCount = reporters.size;
  tally.reporters = Array
  .from(reporters)
  .map(toolID => toolNames[toolID])
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  // Return the tally.
  return tally;
};
