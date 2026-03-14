/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getDateTimeString,
  getLog,
  getPathID,
  getReport,
  getReporterString,
  getWeightName,
  makeBreakable,
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');

// FUNCTIONS

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
      const {catalogIndex, pathID} = instance;
      const tagName = catalog[catalogIndex]?.tagName
      ?? pathID?.split('/').pop().replace(/\[.+$/, '').toUpperCase()
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
    // Populate the violator count.
    query.count = Object.keys(violators).length;
  });
  // For each violator:
  Object.values(violators).forEach(violatorData => {
    // Convert the set of its reporters to a string.
    violatorData.reporters = getReporterString(violatorData.reporters);
  });
  // Convert the set of issue reporters to a string.
  query.reporters = getReporterString(query.reporters);
  // Convert the violator data to an array.
  violators = Object.entries(violators).map(entry => ({
    violatorID: entry[0],
    ... entry[1]
  }));
  // Sort the violators in XPath order.
  violators.sort((a, b) => a.pathID.localeCompare(b.pathID));
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  lines.push(`${margin}<ol>`);
  // For each violator:
  violators.forEach((violator, index) => {
    const {violatorID, pathID, tagName, text, reporters} = violator;
    // Add a heading to the lines.
    lines.push(`${margin}  <li><h3><code class="thin">${makeBreakable(violatorID)}</code></h3>`);
    lines.push(`${margin}    <ul>`);
    // Add properties of the violator to the lines.
    if (pathID && ! violatorID.startsWith('/html')) {
      lines.push(`${margin}      <li>XPath: <code>${makeBreakable(pathID)}</code></li>`);
    }
    if (tagName) {
      lines.push(`${margin}      <li>Tag name: <code>${tagName}</code></li>`);
    }
    if (text && ! ['HTML', 'HEAD', 'BODY', 'MAIN', 'NOSCRIPT'].includes(tagName)) {
      const textString = text.split('\n').join(' … ');
      lines.push(`${margin}      <li>Text: <q>${textString}</q></li>`);
    }
    lines.push(`${margin}      <li>Reported by ${reporters}</li>`);
    const href = `https://example.com/violation/${index + 1}`;
    const questionString = 'What violation details were reported';
    const labelString = `${questionString} for violator ${index + 1}?`;
    lines.push(
      `${margin}      <li><a href="${href}" aria-label="${labelString}">${questionString}?</a></li>`
    );
    lines.push(`${margin}    </ul>`);
    lines.push(`${margin}  </li>`);
  });
  lines.push(`${margin}</ol>`);
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
