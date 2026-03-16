/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getDateTimeString,
  getLog,
  getReport,
  getWeightName,
  htmlSafe,
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const toolNames = require('testaro/procs/job').tools;

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (issueID, timeStamp, jobID, catalogIndex, pathID, query) => {
  // Add facts about the issue to the query.
  query.catalogIndex = catalogIndex;
  const log = await getLog(timeStamp, jobID, true);
  const {pageURL, pageWhat} = log;
  query.target = pageWhat;
  query.issue = issues[issueID].summary;
  query.url = pageURL;
  query.dateTime = getDateTimeString(timeStamp);
  const issue = issues[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = wcag;
  const report = await getReport(timeStamp, jobID);
  const {acts, catalog} = report;
  const catalogItem = catalog[catalogIndex] ?? {};
  const {boxID, startTag, tagName, text} = catalogItem;
  query.tagName = tagName ?? 'HTML';
  if (text && ! ['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName)) {
    query.text = `<q>${htmlSafe(text)}</q>`;
  }
  else {
    query.text = '[not applicable]';
  }
  query.startTag = htmlSafe(startTag) ?? '[not obtained]';
  if (pathID) {
    query.pathID = pathID;
  }
  else {
    query.pathID = '[not obtained]';
  }
  if (boxID) {
    const dims = boxID.split(':');
    query.box = `x = ${dims[0]}, y = ${dims[1]}, width = ${dims[2]}, height = ${dims[3]}`;
  }
  else {
    query.box = '[not obtained]';
  }
  // Initialize an array of diagnoses.
  let diagnoses = [];
  const testActs = acts.filter(act => act.type === 'test');
  // For each test act:
  testActs.forEach(act => {
    const {result, which} = act;
    const caseInstances = result?.standardResult?.instances?.filter(
      instance => instance.issueID === issueID
      && (instance.catalogIndex === catalogIndex || instance.pathID === pathID)
    );
    // For each standard instance that pertains to this combination of issue and violator:
    caseInstances.forEach(instance => {
      const {ruleID, what} = instance;
      // Add lines for it to the array.
      diagnoses.push({
        toolID: which,
        ruleID,
        what
      });
    });
  });
  // Initialize the lines.
  const lines = [];
  const margin = ' '.repeat(6);
  lines.push(`${margin}<ul>`);
  // For each diagnosis:
  diagnoses.forEach((diagnosis, index) => {
    const {toolID, ruleID, what} = diagnosis;
    // Add lines.
    lines.push(`${margin}  <li>Diagnosis ${index + 1}`);
    lines.push(`${margin}    <ul>`);
    lines.push(`${margin}      <li>Tool: ${toolNames[toolID]}</li>`);
    if (ruleID !== what) {
      lines.push(`${margin}      <li>Rule: ${ruleID}</li>`);
    }
    lines.push(`${margin}      <li>Diagnosis: ${htmlSafe(what)}</li>`);
    lines.push(`${margin}    </ul>`);
    lines.push(`${margin}  </li>`);
  });
  lines.push(`${margin}</ol>`);
  // Add the lines to the query.
  query.diagnoses = lines.join('\n');
};
// Returns a page answering the diagnoses question.
exports.answer = async (pageArgs, search) => {
  const [issueID, reportSpec, catalogIndex] = pageArgs.split('/');
  const [timeStamp, jobID] = reportSpec.split('-');
  const params = new URLSearchParams(search);
  const pathID = params.get('pathID');
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, timeStamp, jobID, catalogIndex, pathID, query);
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
