/*
  index.js
  Answers the report-issues question.
*/

// IMPORTS

const {
  getPageDataStrings,
  getReport,
  getTextFragmentHref,
  getWCAGLink,
  getWeightName,
  htmlSafe,
  isHidden,
  tools
} = require('../util');
const {issues} = require('testilo/procs/score/tic');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Adds parameters to a query for the answer page.
const populateQuery = async (issueID, timeStamp, jobID, catalogIndex, pathID, query) => {
  const pageDataStrings = await getPageDataStrings(timeStamp, jobID);
  const {what, url, urlLink, testInfo} = pageDataStrings;
  const report = await getReport(timeStamp, jobID);
  const {acts, catalog} = report;
  const catalogItem = catalog[catalogIndex] ?? {};
  const {boxID, startTag, tagName, text} = catalogItem;
  query.catalogIndex = catalogIndex;
  const lines = [];
  const margin = ' '.repeat(6);
  if (catalogIndex && catalogItem.textLinkable) {
    const href = getTextFragmentHref(text, url);
    const label = `Take me to element ${catalogIndex} on the page (in a new tab)`;
    const link = `<a href="${href}" target="_blank" aria-label="${label}">Take me there</a>`;
    query.takeMeThere = `${margin}    <p>${link}</p>`;
  }
  else {
    query.takeMeThere = '';
  }
  // Add facts about the issue to the query.
  query.target = what;
  query.urlLink = urlLink;
  query.testInfo = testInfo;
  query.issue = issues[issueID].summary;
  const issue = issues[issueID];
  const {wcag, weight, why} = issue;
  query.why = why;
  query.priority = getWeightName(weight);
  query.wcag = `<a href="${getWCAGLink(wcag)}">${wcag}</a>`;
  query.tagName = tagName || 'HTML';
  if (text && ! ['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName)) {
    const textString = text.split('\n').join(' … ');
    query.text = `<q>${htmlSafe(textString)}</q>`;
  }
  else {
    query.text = '[not applicable]';
  }
  query.startTag = htmlSafe(startTag) || '[not obtained]';
  query.pathID = pathID || '[not obtained]';
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
      instance => instance.issueID === issueID && instance.catalogIndex === catalogIndex
    ) ?? [];
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
  // For each diagnosis:
  diagnoses.forEach(diagnosis => {
    const {toolID, ruleID, what} = diagnosis;
    // Add lines.
    lines.push(`${margin}<li>${htmlSafe(what)}`);
    lines.push(`${margin}  <p>Tool: ${tools[toolID][0]} (${tools[toolID][1]})</p>`);
    if (ruleID !== what) {
      lines.push(`${margin}  <p>Rule: <code>${ruleID}</code></p>`);
    }
    lines.push(`${margin}</li>`);
  });
  // Add the lines to the query.
  query.diagnoses = lines.join('\n');
};
// Returns a page answering the diagnoses question.
exports.answer = async (pageArgs, search) => {
  const [issueID, timeStamp, jobID, catalogIndex] = pageArgs.split('/');
  const reportIsHidden = await isHidden(timeStamp, jobID);
  // If the report is not available:
  if (reportIsHidden) {
    return {
      status: 'error',
      message: 'Report not available'
    };
  }
  const params = new URLSearchParams(search);
  const pathID = params.get('pathID');
  const query = {};
  // Create a query to replace the placeholders.
  await populateQuery(issueID, timeStamp, jobID, catalogIndex, pathID, query);
  // If the test specifications are valid:
  if (query.testInfo) {
    // Get the template.
    let answerPage = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
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
    status: 'error',
    error: 'Invalid report specification'
  };
};
