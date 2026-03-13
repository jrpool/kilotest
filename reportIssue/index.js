/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  annotateReport,
  getDateTimeString,
  getLog,
  getPathID,
  getReport,
  getReporterString,
  getWeightName,
  objectSort
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// FUNCTIONS

// Gets summary data on the issues reported in a report.
const getIssuesSummary = async (timeStamp, jobID) => {
  // Initialize data for the summary.
  const log = await getLog(timeStamp, jobID, true);
  const {pageURL, pageWhat} = log;
  query.target = pageWhat;
  query.url = pageURL;
  query.dateTime = getDateTimeString(timeStamp);
  const issuesData = {
    timeStamp,
    jobID,
    pageWhat,
    pageURL,
    issues: {}
  };
  // If the report is not yet annotated:
  if (! annotated) {
    // Annotate it and mark it as annotated in the log.
    await annotateReport(timeStamp, jobID);
  }
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // For each act in it:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // For each of its standard instances:
      instances.forEach(instance => {
        const {count, issueID} = instance;
        // If the instance has a non-ignorable issue ID:
        if (issueID && issueID !== 'ignorable') {
          issuesData.issues[issueID] ??= {
            count: 0,
            reporters: new Set()
          };
          // Add the instance data on violations to the data on its issue.
          issuesData.issues[issueID].count += count ?? 1;
          issuesData.issues[issueID].reporters.add(which);
        }
      });
    }
  });
  // Initialize the summary.
  const summary = {
    timeStamp: issuesData.timeStamp,
    jobID: issuesData.jobID,
    pageWhat: issuesData.pageWhat,
    pageURL: issuesData.pageURL,
    count: 0,
    reporters: new Set(),
    issues: []
  };
  // For each issue:
  Object.entries(issuesData.issues).forEach(([issueID, data]) => {
    const {count, reporters} = data;
    // Increment the report violation count by the issue violation count.
    summary.count += count;
    // Ensure that the report reporters include the issue reporters.
    reporters.forEach(reporter => {
      summary.reporters.add(reporter);
    });
    // Add the issue data to the summary.
    summary.issues.push({
      issueID,
      weight: issues[issueID].weight,
      count,
      reporters: getReporterString(reporters)
    });
  });
  // Sort the issues in descending count order.
  objectSort(summary.issues, 'count', 'numericDown');
  // Sort them again in descending priority order, making this the primary order.
  objectSort(summary.issues, 'weight', 'numericDown');
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async (issueID, timeStamp, jobID, query) => {
  // Add facts about the issue to the query.
  query.issue = issues[issueID].summary;
  const log = await getLog(timeStamp, jobID, true);
  const {pageURL, pageWhat} = log;
  query.target = pageWhat;
  query.url = pageURL;
  query.dateTime = getDateTimeString(timeStamp);
  const issue = issues[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = wcag;
  // Initialize those whose values depend on instance inspection.
  query.count = 0;
  query.reporters = new Set();
  let violators = {};
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  const {acts, catalog} = report;
  const testActs = acts.filter(act => act.type === 'test');
  // For each test act:
  testActs.forEach(act => {
    const {result, which} = act;
    const issueInstances = result?.standardResult?.instances?.filter(
      instance => instance.issueID === issueID
    );
    // If the rule of any of its standard instances belongs to the issue:
    if (issueInstances.length) {
      query.reporters.add(which);
    }
    // For each standard instance whose rule bolongs to the issue:
    issueInstances.forEach(instance => {
      const {catalogIndex, count, pathID} = instance;
      // Add its violation count to the query.
      query.count += count;
      const tagName = catalog[catalogIndex]?.tagName
      ?? pathID.split('/').pop().replace(/\[.+$/, '').toUpperCase()
      ?? `HTML`;
      const violatorID = catalog[catalogIndex]?.pathID ?? pathID ?? '/html';
      violators[violatorID] ??= {
        pathID: getPathID(catalog, catalogIndex, pathID),
        tagName,
        text: catalog[catalogIndex]?.text ?? '',
        reporters: new Set()
      };
      // Ensure that the tool is in the sets of reporters of the violator and the issue.
      violators[violatorID].reporters.add(which);
      query.reporters.add(which);
    });
  });
  // For each violator:
  Object.values(violators).forEach(violatorData => {
    // Convert the set of its reporters to a string.
    violatorData.reporters = getReporterString(violatorData.reporters);
  });
  // Convert the set of issue reporters to a string.
  query.reporters = getReporterString(query.reporters);
  // Convert the violators to an array.
  violators = Object.entries(violators).map(entry => ({
    violatorID: entry[0],
    ... entry[1]
  }));
  // Sort the violators in XPath order.
  violators.sort((a, b) => a.pathID.localeCompare(b.pathID));
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For each violator:
  violators.forEach(violator => {
    const {violatorID, pathID, tagName, text, reporters} = violator;
    // Add a heading to the lines.
    lines.push(`${margin}<h3>${violatorID}</h3>`);
    lines.push(`${margin}<ul>`);
    // Add properties of the violator to the lines.
    if (pathID && ! violatorID.startsWith('/html')) {
      lines.push(`${margin}  <li>XPath: ${pathID}</li>`);
    }
    if (tagName) {
      lines.push(`${margin}  <li>Tag name: ${tagName}</li>`);
    }
    if (text) {
      const textString = text.split('\n').join(' … ');
      lines.push(`${margin}  <li>Text: ${textString}</li>`);
    }
    lines.push(`${margin}  <li>Reported by ${reporters}</li>`);
    lines.push(`${margin}</ul>`);
  });
  // Add the lines to the query.
  query.violators = lines.join('\n');
};
// Returns a page answering the report-issue-violations question.
exports.answer = async (issueID, reportSpec) => {
  const [timeStamp, jobID] = reportSpec.split('-');
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, timeStamp, jobID, query);
  // If the date and time are valid:
  if (query.dateTime) {
    // Get the template.
    let answerPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
    // Replace its placeholders.
    Object.keys(query).forEach(param => {
      answerPage = answerPage.replace(new RegExp(`__${param}__`, 'g'), query[param]);
    });
    // Return the populated page.
    return {
      status: 'ok',
      answerPage
    };
  }
  // Otherwise, report this.
  return {
    status: 'bad',
    error: 'Error: Invalid report specification.'
  };
};
