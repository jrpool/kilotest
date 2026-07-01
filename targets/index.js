/*
  index.js
  Answers the targets question.
*/

// IMPORTS

const {
  getAgoDays,
  getCountString,
  getJobNames,
  getObject,
  getPageDataStrings,
  getRecs,
  getLogs,
  getReportData,
  isRecommendable,
  jobsPath
} = require('../util');
const fs = require('fs/promises');
const path = require('path');

// FUNCTIONS

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
    ? 'Kilotest managers can <a href="recActionForm.html">approve or reject a recommendation</a>.'
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
  // Get the logs of the non-hidden reports.
  const targetLogs = await getLogs();
  query.which = targetLogs.length ? 'the following' : 'no';
  query.some = (targetLogs.length || jobFileNames.queue.length || jobFileNames.claimed.length)
    ? 'another'
    : 'a';
  const multiReportTargets = new Set(targetLogs.filter(log => log.superseded).map(log => log.what));
  // For each log:
  for (const targetLog of targetLogs) {
    const {jobName, url, what} = targetLog;
    const [timeStamp, jobID] = jobName.split('-');
    const reportData = await getReportData(timeStamp, jobID);
    const {
      issueCount,
      preventedToolCount,
      preventedToolNames,
      reporterNames,
      reporterCount,
      violatorCount
    } = reportData;
    lines.tested.push(`${margin}<details>`);
    const daysAgo = getAgoDays(timeStamp);
    const pageDataStrings = await getPageDataStrings(timeStamp, jobID, {what, url, daysAgo});
    const {urlLink, testInfo} = pageDataStrings;
    const testText = multiReportTargets.has(what) ? ` (${testInfo.toLowerCase()})` : '';
    lines.tested.push(`${margin}  <summary>${what}${testText}</summary>`);
    lines.tested.push(`${margin}  <ul>`);
    // Add the URL of the target to the lines.
    lines.tested.push(`${margin}    <li>URL: ${urlLink}</li>`);
    // Add facts about the report to the lines.
    lines.tested.push(`${margin}    <li>${testInfo}</li>`);
    // If the page prevented any tool from performing its tests:
    if (preventedToolCount) {
      // Add this to the lines.
      const toolCountString = getCountString(preventedToolCount, 'tool', 'tools');
      lines.tested.push(
        `${margin}    <li>Page not testable by ${toolCountString} (${preventedToolNames.join(' + ')})</li>`,
      );
    }
    // Add facts about the test results to the lines.
    let reporterString = `${getCountString(reporterCount, 'tool', 'tools')} reported issues`;
    if (reporterCount) {
      const reporterNamesString = reporterNames.join(' + ');
      reporterString = `${reporterString} (${reporterNamesString})`;
    }
    const issueCountString = getCountString(issueCount, 'issue was', 'issues were');
    const violatorString = getCountString(violatorCount, 'violator was', 'violators were');
    lines.tested.push(`${margin}    <li>${reporterString}</li>`);
    lines.tested.push(`${margin}    <li>${issueCountString} reported</li>`);
    lines.tested.push(`${margin}    <li>${violatorString} reported</li>`);
    lines.tested.push(`${margin}  </ul>`);
    lines.tested.push(`${margin}<ul class="nav">`);
    // If any issues were reported:
    if (issueCount) {
      // Add a question link about the reported issues to the lines.
      const href = `href="reportIssues.html/${timeStamp}/${jobID}"`;
      const label = `aria-label="What ${issueCountString} reported for the ${what} page?"`;
      const questionString = issueCount === 1 ? 'was the issue' : 'were the issues';
      const link = `<a ${href} ${label}>What ${questionString}?</a>`;
      lines.tested.push(`${margin}    <li>${link}</li>`);
    }
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
    lines.tested.push(`${margin}</details>`);
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
