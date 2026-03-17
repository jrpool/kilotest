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

// Returns the data from a POST request.
exports.getPOSTData = async request => {
  const bodyParts = [];
  request.on('data', chunk => {
    bodyParts.push(chunk);
  });
  request.on('end', async () => {
    const body = bodyParts.join('');
    const query = querystring.parse(body);
    return query;
  });
};
// Converts a string to a plain-text 1-line ASCII string.
exports.getPlainText = string => string.replace(/&/g, '+').replace(/[^-+=/#%,;:.?! \w]/g, ' ');
// Returns whether a string is a time stamp.
exports.isTimeStamp = string => {
  return /^\d{6}$/.test(string);
};
// Makes a string HTML-safe.
exports.htmlSafe = string => string
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&apos;');
// Encodes a string for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Converts a catalog item text to a text-fragment link destination.
exports.getTextFragmentHref = (text, url) => {
  const fragmentList = text
  .split('\n')
  .map(fragment => fragmentEncode(fragment))
  .join(',');
  // Return a text-fragment link.
  return `${url}#:~:text=${fragmentList}`;
};
// Returns the path of a log file.
const getLogPath = exports.getLogPath
= (timeStamp, jobID) => `${logsPath}/${timeStamp}-${jobID}.json`;
// Returns the path of a report file.
const getReportPath = exports.getReportPath
= (timeStamp, jobID) => `${reportsPath}/${timeStamp}-${jobID}.json`;
// Returns a report.
const getReport = exports.getReport = async (timeStamp, jobID) => {
  const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID));
  const report = JSON.parse(reportJSON);
  return report;
};
// Returns the JSON stringification of an object.
const getJSON = exports.getJSON = object => `${JSON.stringify(object, null, 2)}\n`;
// Returns a date string from a time stamp.
const getDateString = exports.getDateString = timeStamp => {
  const dateString = `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}`;
  // If the date part of the time stamp is valid:
  if (Date.parse(dateString)) {
    // Return a date string from it.
    return dateString;
  }
  // Otherwise, return a failure.
  return '';
};
// Returns whether a string is a time stamp.
exports.isTimeStamp = string => {
  return !! getDateString(string);
};
// Returns whether a string is a job ID.
exports.isJobID = string => {
  return /^[a-z0-9]{5}$/.test(string);
};
// Returns a time stamp from a date.
exports.getTimeStamp = date => {
  const timeStamp = date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11);
  return timeStamp;
};
// Returns a time stamp for now.
exports.getNowStamp = () => {
  return getTimeStamp(new Date());
};
// Returns a time string from a time stamp.
const getTimeString = timeStamp => {
  const timeString = `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
  // If the time part of the time stamp is valid:
  if (Date.parse(`2000-01-01T${timeString}`)) {
    // Return a time string from it.
    return timeString;
  }
  // Otherwise, return a failure.
  return '';
};
// Returns a date-and-time string.
exports.getDateTimeString = timeStamp => {
  const dateString = getDateString(timeStamp);
  const timeString = getTimeString(timeStamp);
  const dateTimeString = `${dateString} at ${timeString}`;
  return dateTimeString;
}
// Compares strings alphabetically and case-insensitively.
const alphaCompare = (a, b) => a.localeCompare(b, 'en', {sensitivity: 'accent'});
// Sorts strings alphabetically and case-insensitively.
const alphaSort = strings => strings.sort((a, b) => alphaCompare(a, b));
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
// Makes a string breakable before non-initial slashes.
exports.makeBreakable = string => string.replace(/\//g, '<wbr>/').replace(/^<wbr>/, '');
// Returns the path ID of the element of a standard instance.
exports.getPathID = (catalog, catalogIndex, pathID) => {
  if (catalogIndex) {
    const catalogItem = catalog[catalogIndex];
    if (catalogItem.pathID) {
      return catalogItem.pathID;
    }
    return pathID ?? '/html';
  }
  return pathID ?? '/html';
};
// Returns a string of tool names.
exports.getReporterString = toolIDSet =>
  alphaSort(Array.from(toolIDSet).map(toolID => toolNames[toolID])).join(' + ');
// Gets the name of an issue weight.
exports.getWeightName = weight => ['lowest', 'low', 'high', 'highest'][weight - 1] ?? 'unknown';
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
// Returns the issue that a rule belongs to.
const getIssue = (toolID, ruleID) => {
  const ruleIDs = getRuleIDs();
  const {invariant, variable} = ruleIDs;
  // Initialize the issue ID of the rule as if the rule ID is invariant.
  let issueID = invariant[toolID]?.[ruleID];
  // If the initialization succeeded:
  if (issueID) {
    // Return it.
    return issueID;
  }
  // Otherwise, change the rule ID to the first matching variable rule ID of the tool.
  ruleID = Object
  .keys(variable[toolID] ?? {})
  .find(variableRuleID => new RegExp(variableRuleID).test(ruleID));
  // If the change succeeded:
  if (ruleID) {
    // Return the issue ID.
    return variable[toolID][ruleID];
  }
  // Otherwise, i.e. if no issue was found, return a failure result.
  return null;
};
// Returns the log of a report.
const getLog = exports.getLog = async (timeStamp, jobID, forceAnnotation = false) => {
  const logJSON = await fs.readFile(getLogPath(timeStamp, jobID));
  const log = JSON.parse(logJSON);
  if (forceAnnotation && ! log.annotated) {
    annotateReport(timeStamp, jobID);
  }
  return log;
};
// Adds issue IDs to the standard instances of a report.
const annotateReport = exports.annotateReport = async (timeStamp, jobID) => {
  let report = {};
  try {
    // Get a copy of the report.
    report = await getReport(timeStamp, jobID);
  }
  // If it is invalid:
  catch (error) {
    // Report this.
    console.log(`ERROR: Report ${getReportPath(timeStamp, jobID)} is not JSON`);
    // Leave the report and log unchanged.
    return;
  }
  const unclassifiableRules = new Set();
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
        // Add the issue ID to the instance.
        instance.issueID = issueID;
        if (! issueID) {
          unclassifiableRules.add(`${which}:${ruleID}`);
        }
      }
    }
  }
  // If any rules were unclassifiable:
  if (unclassifiableRules.size) {
    const errorsJSON = JSON.stringify(Array.from(unclassifiableRules).sort(), null, 2);
    // Report them.
    console.log(
      `ERROR: Unclassifiable rules:\n${errorsJSON}`
    );
  }
  // Save the annotated report.
  await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
  // Get a copy of the log of the report.
  const log = await getLog(timeStamp, jobID, false);
  // Mark the report as annotated in the log.
  log.annotated = true;
  // Save the revised log.
  await fs.writeFile(getLogPath(timeStamp, jobID), getJSON(log));
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
