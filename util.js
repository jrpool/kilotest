/*
  util.js
  Utility functions.
*/

// IMPORTS

const {issues} = require('testilo/procs/score/tic');
const toolNames = require('testaro/procs/job').tools;
const fs = require('fs/promises');

// CONSTANTS

// Path of the logs directory.
const logsPath = `${__dirname}/logs`;
// Path of the reports directory.
const reportsPath = `${__dirname}/reports`;

// FUNCTIONS

// Returns the path of a log file.
const getLogPath = exports.getLogPath
= (timeStamp, jobID) => `${logsPath}/${timeStamp}-${jobID}.json`;
// Returns the path of a report file.
const getReportPath = exports.getReportPath
= (timeStamp, jobID) => `${reportsPath}/${timeStamp}-${jobID}.json`;
// Returns the JSON stringification of an object.
const getJSON = exports.getJSON = object => `${JSON.stringify(object, null, 2)}\n`;
// Compares strings alphabetically and case-insensitively.
const alphaCompare = (a, b) => a.localeCompare(b, 'en', {sensitivity: 'accent'});
// Sorts strings alphabetically and case-insensitively.
const alphaSort = exports.alphaSort = strings => strings.sort((a, b) => alphaCompare(a, b));
// Sorts objects by a property value.
const objectSort = exports.objectSort = (objects, property, sortType) => objects
.sort((a, b) => {
  // If the property values are numbers to be sorted in increasing order:
  if (sortType === 'numericUp') {
    // Sort by increasing numeric value.
    return a[property] - b[property];
  }
  // Otherwise, if they are numbers to be sorted in decreasing order:
  else if (sortType === 'numericDown') {
    // Sort by decreasing numeric value.
    return b[property] - a[property];
  }
  // Otherwise, if they are strings to be sorted alphabetically:
  else if (sortType === 'alpha') {
    // Sort alphabetically.
    return alphaCompare(a[property], b[property]);
  }
  // Otherwise, do not sort.
  return 0;
});
// Sorts violator by ID, numerically for catalog indexes, then alphabetically for path IDs.
const violatorSort = violators => violators.sort((a, b) => {
  if (a.id.startsWith('html/')) {
    if (b.id.startsWith('html/')) {
      return alphaCompare(a.id, b.id);
    }
    return -1;
  }
  if (b.id.startsWith('html/')) {
    return 1;
  }
  return Number(a.id) - Number(b.id);
});
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
const getIssue = (toolID, ruleID) => {
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
const annotateReport = async (timeStamp, jobID) => {
  // Get a copy of the report.
  const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
  let report = {};
  try {
    report = JSON.parse(reportJSON);
  }
  // If it is invalid:
  catch (error) {
    // Report this.
    console.log(`ERROR: Report ${getReportPath(timeStamp, jobID)} is not JSON`);
    // Leave the report and log unchanged.
    return;
  }
  // For each of its acts:
  for (const act of report.acts) {
    const {result, type, which} = act;
    // If it is a test act:
    if (type === 'test') {
      // For each standard instance of the result:
      for (const instance of result?.standardResult?.instances ?? []) {
        const {ruleID} = instance;
        // Classify its rule.
        const issueID = getIssue(which, ruleID);
        // If the classification succeeded:
        if (issueID) {
          // Add the issue ID to the instance.
          instance.issueID = issueID;
        }
        // Otherwise, i.e. if the classification failed:
        else {
          // Report this.
          console.log(`ERROR: Could not classify rule ${ruleID} of tool ${which}`);
        }
      }
    }
  }
  // Save the annotated report.
  await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
  // Get a copy of the log of the report.
  const logJSON = await fs.readFile(getLogPath(timeStamp, jobID), 'utf8');
  const log = JSON.parse(logJSON);
  // Mark the report as annotated in the log.
  log.annotated = true;
  // Save the revised log.
  await fs.writeFile(getLogPath(timeStamp, jobID), getJSON(log));
};
// Gets data on the issues reported in a set of reports.
exports.getIssueData = async logs => {
  // Initialize the issue data.
  const issueData = {};
  // For each log:
  for (const log of logs) {
    const {annotated, timeStamp, jobID} = log;
    // If the corresponding report is not yet annotated:
    if (! annotated) {
      // Annotate it and mark it as annotated in the log.
      await annotateReport(timeStamp, jobID);
    }
    // Get the corresponding report.
    const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
    const report = JSON.parse(reportJSON);
    // For each act in it:
    report.acts.forEach(act => {
      // If it is a test act:
      if (act.type === 'test') {
        const {which} = act;
        const instances = act.result?.standardResult?.instances ?? [];
        // For each of its standard instances:
        instances.forEach(instance => {
          const {count, issueID} = instance;
          // Increment the issue data with its count and reporter.
          issueData[issueID] ??= {
            count: 0,
            reporters: new Set()
          };
          issueData[issueID].count += count ?? 1;
          issueData[issueID].reporters.add(which);
        });
      }
    });
  }
  // Return the issue data.
  return issueData;
};
// Gets the data from a POST request.
exports.getPostData = async request => {
  return new Promise((resolve, reject) => {
    const bodyParts = [];
    request.on('error', async err => {
      reject(err);
    })
    .on('data', chunk => {
      bodyParts.push(chunk);
    })
    // When the request has arrived:
    .on('end', async () => {
      try {
        // Get a query string from the request body.
        const queryString = Buffer.concat(bodyParts).toString();
        // Parse it as an array of key-value pairs.
        const requestParams = new URLSearchParams(queryString);
        // Convert it to an object with string-valued properties.
        const postData = {};
        requestParams.forEach((value, name) => {
          postData[name] = value;
        });
        resolve(postData);
      }
      catch (err) {
        reject(err);
      }
    });
  });
};
// Returns data on violations of rules by issue weight and reporters.
exports.getTally = report => {
  // Initialize the tally.
  const tally = {
    issueCount: 0,
    reporterCount: 0,
    solos: {},
    reporters: [],
    weights: []
  };
  [4, 3, 2, 1].forEach(weight => {
    tally.weights.push({
      weight,
      issues: {}
    });
  });
  const solos = new Set();
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
        const reportedRuleID = ruleID;
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
          // If the rule is not deprecated:
          if (issueID !== 'ignorable') {
            const issue = issues[issueID];
            const {weight} = issue;
            const weightIssues = tally.weights[4 - weight].issues;
            // If necessary, nitialize the data on the issue as the classifier issue entry.
            weightIssues[issueID] ??= issues[issueID];
            const issueData = weightIssues[issueID];
            // If necessary, add initialized violation data to the issue data.
            issueData.violatorCount ??= 0;
            issueData.reporters ??= new Set();
            issueData.violators ??= {};
            let {violatorCount} = issueData;
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
                // Add data on the violation to the issue data.
                violatorCount += instance.count ?? 1;
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
        }
        // Otherwise, i.e. if no classified rule has an ID that is or matches that of the instance:
        else {
          const soloString = `${toolID}:${reportedRuleID}`;
          // If the rule is not yet included in the solos:
          if (! solos.has(soloString)) {
            // Add it to the solos:
            solos.add(`${toolID}:${reportedRuleID}`);
            // Report it.
            console.log(`ERROR: Rule ${soloString} does not belong to any issue`);
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
        violatorCount: issueData.violatorCount,
        reporterCount: issueData.reporters.size,
        reporters: alphaSort(Array.from(issueData.reporters).map(toolID => toolNames[toolID]))
      };
      // Initialize an array of data on the violators of any rule belonging to the issue.
      const violators = [];
      // Initialize a set of ensemble-describing strings.
      const ensembles = new Set();
      // For each violator of any rule belonging to the issue:
      Object.keys(issueData.violators).forEach(violatorID => {
        // Get a string describing the ensemble of its reporters.
        const ensembleString = alphaSort(
          Array.from(issueData.violators[violatorID].reporters).map(toolID => toolNames[toolID])
        ).join(' + ');
        // Ensure that the ensemble string is in the set.
        ensembles.add(ensembleString);
        // Add data on the violator to the array.
        violators.push({
          id: violatorID,
          ensembleString
        });
      });
      // Sort the data on the violators by violator ID.
      violatorSort(violators);
      // Initialize an array of the ensembles sorted alphabetically.
      const ensembleArray = alphaSort(Array.from(ensembles));
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
    objectSort(issueArray, 'reporterCount', 'numericDown');
    // Replace the issues object for the weight in the tally with the issue array.
    tally.weights[4 - weight].issues = issueArray;
  });
  // Add the issue count, reporter count, reporter list, and solos to the tally.
  tally.issueCount = reportedIssues.size;
  tally.reporterCount = reporters.size;
  tally.reporters = alphaSort(Array.from(reporters).map(toolID => toolNames[toolID]));
  tally.solos = Array.from(solos);
  // Return the tally.
  return tally;
};
// Returns an array of the latest logs of tested targets.
exports.getTargetLogs = async () => {
  // Initialize a directory of tested targets.
  const targetDirectory = {};
  const logNames = await fs.readdir(logsPath);
  // For each log:
  for (const logName of logNames) {
    const logJSON = await fs.readFile(`${logsPath}/${logName}`, 'utf8');
    const log = JSON.parse(logJSON);
    // Add its data to the targets directory, replacing any entry for the same target URL.
    targetDirectory[log.pageURL] = log;
  }
  // Get an array of those target logs, sorted by description.
  const targets = objectSort(Object.values(targetDirectory), 'pageWhat', 'alpha');
  return targets;
};
// Serves an error message.
exports.serveError = async (error, response) => {
  console.log(error.message);
  if (! response.writableEnded) {
    response.statusCode = 400;
    const errorTemplate = await fs.readFile('error.html', 'utf8');
    const errorPage = errorTemplate.replace(/__error__/, error.message);
    response.end(errorPage);
  }
};
// Digests a scored report and returns it, digested.
exports.digest = async (digester, report, query = {}) => {
  // Create a digest.
  const digest = await digester(report, query);
  console.log(`Report ${report.id} digested`);
  // Return the digest.
  return digest;
};
