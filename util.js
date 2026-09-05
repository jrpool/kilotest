/*
  util.js
  Utility functions.
*/

// IMPORTS

const {sendAlert} = require('./alerts');
const {issues: issueSpecs, rules: ruleSpecs} = require('testaro-issues');
const fs = require('fs/promises');
const path = require('path');
const querystring = require('querystring');
const wcagMap = require('./wcagMap.json');

// CONSTANTS

// Path of the data directory. Read afresh on every call (rather than cached at module load) so that tests can point Kilotest at a fixture directory via the DB_DIR environment variable.
const dbPath = exports.dbPath = () => process.env.DB_DIR || path.join(__dirname, 'db');
// Path of the jobs directory.
const jobsPath = exports.jobsPath = () => path.join(dbPath(), 'jobs');
// Path of the recommendations file.
const recsPath = exports.recsPath = () => path.join(jobsPath(), 'recs.json');
// Path of the reports directory.
const reportsPath = exports.reportsPath = () => path.join(dbPath(), 'reports');
// Path of the hidden-reports directory.
const hiddenReportsPath = exports.hiddenReportsPath = () => path.join(dbPath(), 'hiddenReports');
// IDs, names, and sponsors of Testaro rule engines.
const ruleEngines = exports.ruleEngines = {
  alfa: ['Alfa', 'Siteimprove'],
  aslint: ['ASLint', 'eSSENTIAL Accessibility'],
  axe: ['Axe', 'Deque'],
  ed11y: ['Editoria11y', 'Princeton University'],
  htmlcs: ['HTML CodeSniffer', 'Squiz Labs'],
  ibm: ['Accessibility Checker', 'IBM'],
  nuVal: ['Html Checker API', 'World Wide Web Consortium'],
  nuVnu: ['Html Checker', 'World Wide Web Consortium'],
  pour: ['Pour', 'David Yarham and Geoffrey Crofte'],
  qualWeb: ['QualWeb', 'University of Lisbon'],
  surea11y: ['SureA11y', 'Jorge Rumoroso'],
  testaro: ['Testaro', 'CVS Health'],
  wave: ['WAVE', 'Utah State University'],
  wax: ['WallyAX', 'Wally']
};
exports.researchAgents = {
  'research-agent': 'Internal Research Agent'
}

// MISCELLANEOUS FUNCTIONS

// Compares strings alphabetically and case-insensitively.
const alphaCompare = (a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'});
// Sorts strings alphabetically and case-insensitively.
const alphaSort = strings => strings.sort((a, b) => alphaCompare(a, b));
// Returns a function that executes a function sequentially.
/** @returns {<T>(fn: () => T | Promise<T>) => Promise<T>} */
const createLock = exports.createLock = () => {
  let queue = Promise.resolve();
  return fn => {
    const result = queue.then(fn, fn);
    queue = result.then(() => {}, () => {});
    return result;
  };
};
// Returns a string encoded for use as a URL fragment.
const fragmentEncode = string => {
  return encodeURIComponent(string).replace(/-/g, '%2D');
};
// Returns the time in days since a Date or time stamp, or null if the argument is invalid.
const getAgoDays = exports.getAgoDays = timeArg => {
  let dateTime;
  // If the argument is a string:
  if (typeof timeArg === 'string') {
    // Convert it from a time stamp to a Date, or null if invalid.
    dateTime = getDateTime(timeArg);
  }
  // Otherwise, if it is a Date:
  else if (timeArg instanceof Date) {
    // Convert it to null if it is invalid.
    dateTime = timeArg.toString() === 'Invalid Date' ? null : timeArg;
  }
  // Otherwise, i.e. if the argument is not a string or a Date:
  else {
    // Return this.
    return null;
  }
  // If the argument is invalid:
  if (!dateTime) {
    // Return this.
    return null;
  }
  // Otherwise, i.e. if it is valid, return the elapsed days since then.
  return Math.round((Date.now() - dateTime.getTime()) / (1000 * 60 * 60 * 24));
};
// Returns a string describing the time in days since a time stamp.
exports.getAgoString = timeStamp => {
  const agoDays = getAgoDays(timeStamp);
  return agoDays === 1 ? '1 day' : `${agoDays} days`;
};
// Returns a string describing a count.
exports.getCountString = (count, singular, plural) => count === 1 ? `1 ${singular}` : `${count} ${plural}`;
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
// Returns the date and time represented by a time stamp.
const getDateTime = exports.getDateTime = timeStamp => {
  const dateString
  = `20${timeStamp.slice(0, 2)}-${timeStamp.slice(2, 4)}-${timeStamp.slice(4,6)}T${timeStamp.slice(7,9)}:${timeStamp.slice(9,11)}Z`;
  const dateTime = new Date(dateString);
  return dateTime.toString() === 'Invalid Date' ? null : dateTime;
};
// Returns the issue that a rule belongs to, or null if none.
const getIssue = exports.getIssue = (engineID, ruleID) => {
  const engineRules = ruleSpecs[engineID];
  // If the rule engine has no rule specifications:
  if (!engineRules) {
    // Return a failure result.
    return null;
  }
  const {invariant, variable} = engineRules;
  // If the rule ID is invariant and classified:
  if (invariant[ruleID]) {
    // Return its issue ID.
    return invariant[ruleID].issueID;
  }
  // Otherwise, find the first matching variable rule ID pattern.
  const variableRuleID = Object
  .keys(variable)
  .find(pattern => new RegExp(`^${pattern}$`).test(ruleID));
  // Return the issue ID if a pattern matched, or a failure result otherwise.
  return variableRuleID ? variable[variableRuleID].issueID : null;
};
// Gets the names and categories of the job files.
const getJobNames = exports.getJobNames = async () => {
  const jobNames = {};
  let fileNames;
  for (const category of ['queue', 'claimed', 'failed']) {
    try {
      fileNames = await fs.readdir(path.join(jobsPath(), category));
    }
    catch(error) {
      return `ERROR: Job directory ${category} not readable (${error.message})`;
    }
    jobNames[category] = fileNames;
  }
  return jobNames;
}
// Returns the JSON stringification of an object, with a final newline.
const getJSON = exports.getJSON = object => `${JSON.stringify(object, null, 2)}\n`;
// Returns an object from a JSON file.
const getObject = exports.getObject = async filePath => {
  let fileContent, object;
  try {
    fileContent = await fs.readFile(filePath, 'utf8');
  }
  catch(error) {
    return `ERROR: File ${filePath} not readable (${error.message})`;
  }
  try {
    object = JSON.parse(fileContent);
  }
  catch(error) {
    return `ERROR: File ${filePath} not JSON (${error.message})`;
  }
  return object;
};
// Returns a random string.
exports.getRandomString = length => {
  return Math.random().toString(36).slice(2, length + 2);
};
// Returns a time stamp from a date.
const getTimeStamp = exports.getTimeStamp = date => {
  const timeStamp = date.toISOString().slice(2).replace(/[-:]/g, '').slice(0, 11);
  return timeStamp;
};
// Returns a time stamp for now.
const getNowStamp = exports.getNowStamp = () => {
  return getTimeStamp(new Date());
};
// Returns a time string from a time stamp.
const getTimeString = timeStamp => {
  const timeString = `${timeStamp.slice(7, 9)}:${timeStamp.slice(9, 11)}`;
  // Return a time string from it.
  return (Date.parse(`2000-01-01T${timeString}Z`)) ? timeString : null;
};
// Returns a date-and-time string.
const getDateTimeString = exports.getDateTimeString = timeStamp => {
  const dateString = getDateString(timeStamp);
  const timeString = getTimeString(timeStamp);
  const dateTimeString = `${dateString} at ${timeString}`;
  return dateTimeString;
}
// Converts a string to a plain-text 1-line ASCII string.
const getPlainText = exports.getPlainText = string => string
.replace(/&/g, '+')
.replace(/[<>"'&]/g, ' ');
// Returns the data from a POST request.
exports.getPOSTData = request => new Promise(resolve => {
  const bodyParts = [];
  request.on('data', chunk => {
    bodyParts.push(chunk);
  });
  request.on('end', () => {
    const {headers} = request;
    const contentType = headers['content-type'] || headers['body-type'] || '';
    if (contentType.startsWith('application/json')) {
      const bodyJSON = bodyParts.join('');
      const body = JSON.parse(bodyJSON);
      resolve(body);
    }
    else if (contentType.startsWith('application/x-www-form-urlencoded')) {
      const body = bodyParts.join('');
      const query = querystring.parse(body);
      resolve(query);
    }
  });
});
// Returns the waiting test and retest recommendations.
const getRecs = exports.getRecs = async () => {
  let recs;
  let recsJSON;
  try {
    recsJSON = await fs.readFile(recsPath(), 'utf8');
  }
  catch(error) {
    await fs.writeFile(recsPath(), '{}\n');
    return `ERROR: recommendations file not readable, so created an empty one (${error.message})`;
  }
  try {
    recs = JSON.parse(recsJSON);
  }
  catch(error) {
    return `ERROR: recommendations file not JSON (${error.message})`;
  }
  return recs;
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
// Returns a +-delimited list of sorted names of rule engines.
exports.getEngineList = engineIDs => Array.from(engineIDs)
.map(engineID => ruleEngines[engineID][0])
.sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}))
.join(' + ');
// Returns a string of names of rule engines.
exports.getEngineNamesString = engineIDSet => alphaSort(
  Array.from(engineIDSet).map(engineID => ruleEngines[engineID]?.[0] || engineID)
).join(' + ');
// Gets the WCAG Understanding link for a numeric WCAG standard identifier.
exports.getWCAGLink = numericID => {
  // Return the link.
  return `https://www.w3.org/WAI/WCAG22/Understanding/${wcagMap[numericID]}`;
};
// Gets the name of an issue weight.
exports.getWeightName = weight => ['lowest', 'low', 'high', 'highest'][weight - 1] ?? 'unknown';
// Makes a string HTML-safe.
exports.htmlSafe = string => string ? string
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&apos;')
: '';
// Returns whether a string is a job ID.
exports.isJobID = string => {
  return /^[a-z0-9]{3}$/.test(string);
};
// Returns whether a job to test a target is eligible for a recommendation.
exports.isRecommendable = async url => {
  const jobNames = await getJobNames();
  // For each claimed job:
  for (const fileName of jobNames.claimed) {
    const job = await getObject(path.join(jobsPath(), 'claimed', fileName));
    // If its URL is that of the recommended target:
    if (job.target.url === url) {
      // Return this.
      return 'claimed';
    }
  }
  // If no claimed job has the URL of the target, for each queued job:
  for (const fileName of jobNames.queue) {
    const job = await getObject(path.join(jobsPath(), 'queue', fileName));
    // If its URL is that of the recommended target:
    if (job.target.url === url) {
      // Return this.
      return 'queued';
    }
  }
  // If no claimed or queued job has the URL of the target, return this.
  return '';
};
// Returns whether a string is a time stamp.
exports.isTimeStamp = string => {
  return !!getDateString(string);
};
// Returns whether a string is a URL.
const isURL = exports.isURL = string => {
  try {
    return string.startsWith('https://') && new URL(string);
  } catch {
    return false;
  }
};
// Makes a string breakable before non-initial slashes.
exports.makeBreakable = string => string.replace(/\//g, '<wbr>/').replace(/^<wbr>/, '');
// Minifies a URL for duplicate detection.
const minifyURL = exports.minifyURL = url => url.replace(/www\.|\/$/g, '').toLowerCase();
// Sorts objects by a property value and returns the sorted array.
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
// Processes a test or retest request in the UI.
exports.processTestRequest = async (testType, dirName, what, url, why) => {
  // If the recommendation is valid:
  if (
    ['test', 'retest'].includes(testType)
    && ['Test', 'Retest'].some(end => dirName.endsWith(end))
    && what
    && isURL(url)
    && why.length > 4
  ) {
    // Make the reason display-safe.
    const plainWhy = getPlainText(why);
    // Update the waiting recommendations as a transaction.
    const updateResult = await updateRecs(what, url, plainWhy);
    // If the recommendation was a duplicate:
    if (updateResult.error === 'duplicate') {
      // Return this.
      return {
        status: 'error',
        message: 'Duplicate recommendation'
      };
    }
    // Otherwise, i.e. if it was not a duplicate:
    else {
      // Log the recommendation.
      console.log(`Test recommendation received for ${what}: ${plainWhy}`);
      // Alert a manager about it.
      await sendAlert(
        `Kilotest: new ${testType} recommendation in the UI`,
        `Target: ${what}\nURL: ${url}\nReason: ${plainWhy}`
      );
      // Get the template.
      let answerPage = await fs.readFile(path.join(dirName, 'index.html'), 'utf8');
      const query = {
        target: what,
        why: plainWhy
      };
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
  }
  return {
    status: 'error',
    message: 'Invalid recommendation'
  };
};
// Concurrency lock for the `recs.json` file.
const recsLock = exports.recsLock = createLock();
// Updates the test recommendations as a transaction.
const updateRecs = exports.updateRecs = (what, url, why) => recsLock(async () => {
  // Get the data on waiting recommendations.
  const recs = await getRecs();
  recs[url] ??= [];
  // If any recommendation has the same description and URL:
  if (recs[url].some(rec => rec.what === what)) {
    // Return this.
    return {
      error: 'duplicate'
    };
  }
  // Otherwise, i.e. if the recommendation is not a duplicate, add it to those for the target.
  recs[url].push({
    timeStamp: getNowStamp(),
    what,
    why
  });
  // Save the revised recommendations.
  await fs.writeFile(recsPath(), getJSON(recs));
  // Return success.
  return {};
});

// REPORT FUNCTIONS

// Returns the path ID of the element of a standard instance.
exports.getPathID = (catalog, catalogIndex, pathID) => {
  if (catalogIndex) {
    const catalogItem = catalog[catalogIndex] || {};
    if (catalogItem.pathID) {
      return catalogItem.pathID;
    }
    return pathID ?? '/html';
  }
  return pathID ?? '/html';
};
// Returns the path of an available report file.
const getReportPath = exports.getReportPath = (timeStamp, jobID) => path
.join(reportsPath(), `${timeStamp}-${jobID}.json`);
// Returns whether a report is valid.
const isValidReport = exports.isValidReport = report => {
  // Return whether it has the type and properties required by Kilotest:
  return typeof report === 'object'
  && typeof report.target?.what === 'string'
  && typeof report.target?.url === 'string'
  && Array.isArray(report.acts)
  && report.acts.every(act =>
    typeof act === 'object'
    && typeof act.type === 'string'
    && act.type === 'test' ? Object.keys(ruleEngines).includes(act.which) : true
  )
  && typeof report.jobData === 'object'
  && report.jobData.endTime
  && !isNaN(new Date(`20${report.jobData.endTime}Z`).getTime())
  && typeof report.catalog === 'object';
};
// Returns a report.
const getReport = exports.getReport = async (timeStamp, jobID) => {
  try {
    const reportJSON = await fs.readFile(getReportPath(timeStamp, jobID), 'utf8');
    const report = JSON.parse(reportJSON);
    // If it is valid:
    if (isValidReport(report)) {
      // Return it.
      return report;
    }
    // Otherwise, i.e. if it is invalid, return this.
    return {error: `Report ${timeStamp}-${jobID} is invalid`};
  } catch (error) {
    return {error: `Report ${timeStamp}-${jobID} is missing, unreadable, or not JSON (${error.message})`};
  }
};
// Adds issue IDs to the standard instances of a report.
exports.annotateReport = async (timeStamp, jobID) => {
  // Get a copy of the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (report.error) {
    // Return why.
    return report.error;
  }
  // Otherwise, i.e. if it succeeded:
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
        // If the rule was classifiable:
        if (issueID) {
          // Add the issue ID to the instance.
          instance.issueID = issueID;
        }
        // Otherwise, i.e. if it was not classifiable:
        else {
          // Add it to the set of unclassifiable rules.
          unclassifiableRules.add(`${which}:${ruleID}`);
          // Remove any existing issue ID from the instance.
          delete instance.issueID;
        }
      }
    }
  }
  const issuelessRules = Array.from(unclassifiableRules).sort();
  // Update the issueless rules in the report.
  report.jobData.issuelessRules = issuelessRules;
  // If any rules were unclassifiable:
  if (issuelessRules.length) {
    // Alert a manager about them.
    await sendAlert(
      'Kilotest: unclassified rules violated',
      `Job ${timeStamp}-${jobID}: Violated rules in no issues:\n${issuelessRules.join('\n')}`
    );
  }
  // Save the annotated report.
  await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
  // Return success.
  return '';
};
// Returns basics about an available report.
exports.getReportData = async (timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (report.error) {
    // Return why.
    return {error: report.error};
  }
  // Otherwise, i.e. if it succeeded, initialize the data.
  const data = {
    what: report.target.what,
    url: report.target.url,
    jobName: report.id,
    creationDate: getDateTime(timeStamp),
    daysAgo: getAgoDays(timeStamp),
    issueCount: 0,
    engineNames: [],
    engineCount: 0,
    reporterNames: [],
    reporterCount: 0,
    violatorCount: 0,
    preventedEngineNames: [],
    preventedEngineCount: 0
  };
  const issueIDSet = new Set();
  const engineNameSet = new Set();
  const reporterIDSet = new Set();
  const violatorIndexSet = new Set();
  // For each act of the report:
  report.acts.forEach(act => {
    // If it is a test act:
    if (act.type === 'test') {
      const {result, which} = act;
      // Ensure that the rule engine is in the temporary data.
      engineNameSet.add(ruleEngines[which][0]);
      const instances = result?.standardResult?.instances ?? [];
      // For each standard instance of the act:
      instances.forEach(instance => {
        const {catalogIndex, issueID, outcome} = instance;
        // If it reports a violation and has a non-ignorable classified issue ID:
        if (outcome !== 'cantTell' && issueID && issueSpecs[issueID] && issueID !== 'ignorable') {
          // Ensure that the rule engine is in the temporary data.
          reporterIDSet.add(which);
          // Ensure that the issue is in the temporary data.
          issueIDSet.add(issueID);
          // If the violator has a catalog index:
          if (catalogIndex) {
            // Ensure that the violator is in the temporary data.
            violatorIndexSet.add(catalogIndex);
          }
        }
      });
    }
  });
  // Populate the data with the act data.
  data.issueCount = issueIDSet.size;
  data.engineNames = Array
  .from(engineNameSet)
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.engineCount = engineNameSet.size;
  data.reporterNames = Array
  .from(reporterIDSet)
  .map(id => ruleEngines[id][0])
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.reporterCount = data.reporterNames.length;
  data.violatorCount = violatorIndexSet.size;
  // Add the names of any prevented rule engines to the data.
  data.preventedEngineNames = Object.keys(report.jobData?.preventions || {})
  .map(engineID => ruleEngines[engineID][0])
  .sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
  data.preventedEngineCount = data.preventedEngineNames.length;
  // Return the data.
  return data;
}
// Returns page data from an available report.
const getPageData = exports.getPageData = async (timeStamp, jobID) => {
  // Get the report.
  const report = await getReport(timeStamp, jobID);
  // If this failed:
  if (report.error) {
    // Return why.
    return report;
  }
  const {url, what} = report.target;
  const reportStats = await getReportStats(timeStamp, jobID)
  // Otherwise, i.e. if it succeeded, get the elapsed time in days since the report was created.
  const daysAgo = getAgoDays(reportStats.reportTime);
  // Return the data.
  return {
    what,
    url,
    daysAgo
  };
};
// Gets HTML strings for page data from a report.
exports.getPageDataStrings = async (timeStamp, jobID, pageData) => {
  // If the page data were not specified:
  if (!pageData) {
    // Get them.
    pageData = await getPageData(timeStamp, jobID);
  }
  const {daysAgo, error, url, what} = pageData;
  // If the page data are invalid:
  if (error) {
    // Return why.
    return {
      error
    };
  }
  // Otherwise, i.e. if they are valid, get a description of the timestamp.
  const when = getDateTimeString(timeStamp);
  // Return the HTML strings.
  return {
    what,
    url,
    urlLink: `<a href="${url}">${url}</a>`,
    testInfo: `Tested ${daysAgo === 1 ? '1 day' : `${daysAgo} days`} ago by job <code>${jobID}</code> on ${when}`
  };
};
// Returns the creation time and size of a report.
const getReportStats = exports.getReportStats = async (timeStamp, jobID) => {
  const reportStat = await fs.stat(
    path.join(reportsPath(), `${timeStamp}-${jobID}.json`),
    {throwIfNoEntry: false}
  );
  if (!reportStat) {
    return null;
  }
  const reportTime = reportStat.birthtime;
  const reportSize = reportStat.size;
  return {reportTime, reportSize};
};
// Returns whether a report is hidden.
exports.isHidden = async (timeStamp, jobID) => {
  await fs.mkdir(hiddenReportsPath(), {recursive: true});
  // Get the names of the hidden report files.
  const hiddenReportFileNames = await fs.readdir(hiddenReportsPath());
  // Return whether the report is among them.
  return hiddenReportFileNames.includes(`${timeStamp}-${jobID}.json`);
};
// Returns an extract of a report from its file name, or null if the file cannot be parsed.
const getExtractFromFileName = async reportFileName => {
  try {
    const reportJSON = await fs.readFile(path.join(reportsPath(), reportFileName), 'utf8');
    const report = JSON.parse(reportJSON);
    const {target, jobData} = report;
    const jobName = reportFileName.slice(0, -5);
    const [timeStamp, jobID] = jobName.split('-');
    const {what, url} = target;
    return {
      timeStamp,
      jobID,
      what,
      url,
      reportTime: new Date(`20${jobData.endTime}Z`).toISOString()
    };
  }
  catch {
    return null;
  }
};
// Returns extracts of all available reports by reading the report files directly.
const getReportExtracts = exports.getReportExtracts = async () => {
  const reportFileNames = await fs.readdir(reportsPath());
  const extracts = [];
  for (const reportFileName of reportFileNames) {
    const extract = await getExtractFromFileName(reportFileName);
    if (extract) {
      extracts.push(extract);
    }
  }
  return extracts;
};
// Returns whether a report is available on a page with a description or URL.
exports.isReportAvailable = async (what, url) => {
  const reportExtracts = await getReportExtracts();
  const whats = reportExtracts.map(reportExtract => reportExtract.what);
  const miniURLs = reportExtracts.map(reportExtract => minifyURL(reportExtract.url));
  return whats.includes(what) || miniURLs.includes(minifyURL(url));
};
// Gets extracts of the latest available reports for all page descriptions.
exports.getLatestReportExtracts = async () => {
  const reportExtracts = await getReportExtracts();
  objectSort(reportExtracts, 'reportTime', 'alpha');
  objectSort(reportExtracts, 'what', 'alpha');
  const latestReportExtracts = reportExtracts
  .filter((extract, index) => extract.what !== reportExtracts[index + 1]?.what);
  return latestReportExtracts;
};
// Returns an extract of an available report by reading the report file directly.
exports.getReportExtract = async (timeStamp, jobID) => {
  const extract = await getExtractFromFileName(`${timeStamp}-${jobID}.json`);
  if (extract) {
    return extract;
  }
  return {
    error: `No report ${timeStamp}-${jobID} is available`
  };
};
// Gets the descriptions of multi-report pages.
exports.getMultiReportWhats = async () => {
  const reportExtracts = await getReportExtracts();
  const sortedWhats = reportExtracts.map(extract => extract.what).sort();
  const multiReportWhats = sortedWhats.filter(
    (what, index) => what !== sortedWhats[index - 1] && what === sortedWhats[index + 1]
  );
  return multiReportWhats;
};
