/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  getAgoString,
  getDateTimeString,
  getJobNames,
  getLog,
  getObject,
  getRecs,
  getReport,
  getReporterString,
  getTargetLogs,
  isRecommendable,
  jobsPath
} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

// Returns a description of a tool count.
const getToolCountString = toolCount => toolCount === 1 ? '1 tool' : `${toolCount} tools`;
// Returns summary data on the results in a report.
const getTargetSummary = async (timeStamp, jobID) => {
  // Annotate the report if necessary.
  await getLog(timeStamp, jobID, true);
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
  const margin = ' '.repeat(8);
  // Initialize the classes of lines.
  const lines = {
    recs: [],
    queue: [],
    claimed: [],
    tested: []
  };
  // Get the recommendations.
  const recs = await getRecs();
  // For each recommended URL:
  Object.keys(recs).forEach(url => {
    // For each of its recommendations:
    recs[url].forEach(rec => {
      const {what, why} = rec;
      // Add a line.
      lines.recs.push(`${margin}<li><code>${url}</code> (${what}): ${why}</li>`);
    });
  });
  // Sort the lines in alphabetical order by URL and secondarily by proposed name.
  lines.recs.sort();
  // Add the lines to the query.
  query.recs = lines.recs.join('\n');
  // Add a no-recommendations message, if applicable, to the query.
  query.noRecs = lines.recs.length
  ? 'Kilotest managers can <a href="testOrderForm.html">approve recommendations</a>.'
  : 'No recommendations await approval now.';
  // Get the file names of all queued and claimed jobs.
  const jobFileNames = await getJobNames();
  // For each job category:
  for (const category of ['queue', 'claimed']) {
    // For each job in the category:
    for (const fileName of jobFileNames[category]) {
      // Get the job.
      const job = await getObject(path.join(jobsPath, category, fileName));
      // Add a line.
      lines[category].push(`${margin}<li><code>${job.target.url}</code> (${job.target.what})</li>`);
    }
    // Add the lines to the query.
    query[category] = lines[category].join('\n');
  }
  // Add a no-queued message, if applicable, to the query.
  query.noQueued = lines.queue.length ? '' : 'No pages are queued for testing.';
  // Add a no-claimed message, if applicable, to the query.
  query.noClaimed = lines.claimed.length ? '' : 'No pages are being tested now.';
  const targetLogs = await getTargetLogs();
  query.which = targetLogs.length ? 'the following' : 'no';
  query.some = (targetLogs.length || jobFileNames.queue.length || jobFileNames.claimed.length)
  ? 'another'
  : 'a';
  // For the latest log on each tested target:
  for (const targetLog of targetLogs) {
    const {jobName, url, what} = targetLog;
    const [timeStamp, jobID] = jobName.split('-');
    const summary = await getTargetSummary(timeStamp, jobID);
    const {issueSet, reporterSet} = summary;
    lines.tested.push(`${margin}<li>${what}</li>`);
    lines.tested.push(`${margin}  <ul>`);
    // Add the URL of the target to the lines.
    lines.tested.push(`${margin}    <li>URL: <code>${url}</code></li>`);
    // Add facts about the report to the lines.
    const dateTimeString = getDateTimeString(timeStamp);
    const agoString = getAgoString(timeStamp);
    const testedString
    = `Last tested ${agoString} ago by job <code>${jobID}</code> on ${dateTimeString}`;
    lines.push(`${margin}    <li>${testedString}</li>`);
    // Add facts about the test results to the lines.
    const issueCountString = issueSet.size === 1 ? '1 issue was' : `${issueSet.size} issues were`;
    const toolCountString = getToolCountString(reporterSet.size);
    const reporterString = getReporterString(reporterSet);
    lines.push(
      `${margin}    <li>${issueCountString} reported by ${toolCountString}: ${reporterString}</li>`
    );
    // Add a question link about the reported issues to the lines.
    const href = `href="reportIssues.html/${timeStamp}/${jobID}"`;
    const label = `aria-label="What ${issueCountString} reported for the ${what} page?"`;
    const questionString = issueSet.size === 1 ? 'was the issue' : 'were the issues';
    const link = `<a ${href} ${label}>What ${questionString}?</a>`;
    lines.push(`${margin}    <li>${link}</li>`);
    // Add the status of, and if necessary a question link about, retesting to the lines.
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
    lines.tested.push(`${margin}    <li>${retestString}</li>`);
    lines.tested.push(`${margin}  </ul>`);
    lines.tested.push(`${margin}</li>`);
  }
  query.testedPages = lines.tested.join('\n');
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
