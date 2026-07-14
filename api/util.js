/*
  util.js
  Utilities for API requests.
*/

// IMPORTS

const {
  getAgoDays,
  getDateTime,
  getLog,
  getReportSize
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns facts about a report.
exports.getReportFacts = async (timeStamp, jobID) => {
  // Get the log of the report.
  const log = await getLog(timeStamp, jobID, false);
  if (log.error) {
    return log;
  }
  const {superseded, url, what} = log;
  const reportSize = await getReportSize(timeStamp, jobID);
  // If its report does not exist:
  if (! reportSize) {
    // Return this.
    return {
      error: `Report ${timeStamp}-${jobID} does not exist.`
    };
  }
  // Otherwise, i.e. if its report exists, get facts about it.
  const facts = {
    identifier: `${timeStamp}-${jobID}`,
    'creation date and time': getDateTime(timeStamp),
    'days since the creation date': getAgoDays(timeStamp),
    'tested web page': {
      description: what,
      URL: url
    },
    'whether a later report about the same page exists': !! superseded,
    'URLs for more details': {
      'for JSON output': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
      'for HTML output': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
    },
    'size of the report in bytes': reportSize,
    'URL to get the entire report as machine-oriented JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
  };
  // Return them.
  return facts;
};
