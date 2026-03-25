/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  annotateReport,
  getAgoString,
  getDateTimeString,
  getLogPath,
  getReport,
  getReporterString,
  getTargetLogs,
  isRecommendable
} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a description of a tool count.
const getToolCountString = toolCount => toolCount === 1 ? '1 tool' : `${toolCount} tools`;
// Returns summary data on the results of testing of a target.
const getTargetSummary = async (timeStamp, jobID) => {
  const targetLogJSON = await fs.readFile(getLogPath(timeStamp, jobID), 'utf8');
  const targetLog = JSON.parse(targetLogJSON);
  // If the target report has not been annotated yet:
  if (! targetLog.annotated) {
    // Annotate it.
    await annotateReport(timeStamp, jobID);
  }
  const summary = {
    issueSet: new Set(),
    reporterSet: new Set()
  };
  const {issueSet, reporterSet} = summary;
  const report = await getReport(timeStamp, jobID);
  // For each act of the report:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      const instances = result?.standardResult?.instances ?? [];
      // If it has any standard instances:
      if (instances.length > 0) {
        // Ensure that the tool is in the summary.
        reporterSet.add(which);
        // For each standard instance:
        instances.forEach(instance => {
          const {issueID} = instance;
          // If it has an issue ID:
          if (issueID) {
            // Ensure that the issue is in the summary.
            issueSet.add(issueID);
          }
        });
      }
    }
  });
  // Return the summary.
  return summary;
};
// Adds parameters to a query for the answer page.
const populateQuery = async query => {
  const targetLogs = await getTargetLogs();
  query.which = targetLogs.length ? 'the following' : 'no';
  query.some = targetLogs.length ? 'another' : 'a';
  // Initialize an array of list-item lines.
  const lines = [];
  const margin = ' '.repeat(6);
  // For the latest log on each target:
  for (const targetLog of targetLogs) {
    const {jobID, url, what, timeStamp} = targetLog;
    const summary = await getTargetSummary(timeStamp, jobID);
    const {issueSet, reporterSet} = summary;
    lines.push(`${margin}<li>${what}</li>`);
    lines.push(`${margin}  <ul>`);
    // Add the URL of the target to the array.
    lines.push(`${margin}    <li>URL: <code>${url}</code></li>`);
    // Add facts about the job to the array.
    const dateTimeString = getDateTimeString(timeStamp);
    const agoString = getAgoString(timeStamp);
    const testedString
    = `Last tested ${agoString} ago by job <code>${jobID}</code> on ${dateTimeString}`;
    lines.push(`${margin}    <li>${testedString}</li>`);
    // Add facts about the test results to the array.
    const issueCountString = issueSet.size === 1 ? '1 issue was' : `${issueSet.size} issues were`;
    const toolCountString = getToolCountString(reporterSet.size);
    const reporterString = getReporterString(reporterSet);
    lines.push(
      `${margin}    <li>${issueCountString} reported by ${toolCountString}: ${reporterString}</li>`
    );
    // Add a question link about the reported issues to the array.
    const href = `href="reportIssues.html/${timeStamp}/${jobID}"`;
    const label = `aria-label="What ${issueCountString} reported for the ${what} page?"`;
    const questionString = issueSet.size === 1 ? 'was the issue' : 'were the issues';
    const link = `<a ${href} ${label}>What ${questionString}?</a>`;
    lines.push(`${margin}    <li>${link}</li>`);
    // Add the status of, and if necessary a question link about, retesting to the array.
    const status = await isRecommendable(url);
    let retestString;
    if (status === 'claimed') {
      retestString = 'Currently being retested';
    }
    else if (status === 'queued') {
      retestString = 'Currently in the queue for retesting';
    }
    else {
      const href = `/retestRecForm.html/${timeStamp}/${jobID}`;
      const retestContent = 'Should Kilotest retest the page?';
      retestString = `<a href="${href}">${retestContent}</a>`;
    }
    lines.push(`${margin}    <li>${retestString}</li>`);
    lines.push(`${margin}  </ul>`);
    lines.push(`${margin}</li>`);
  }
  query.testedPages = lines.join('\n');
};
// Returns a page answering the targets question.
exports.answer = async () => {
  const query = {};
  // Create a query to replace placeholders.
  await populateQuery(query);
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
};
