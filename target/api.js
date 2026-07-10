/*
  api.js
  Responds to the target request.
*/

// IMPORTS

const {
  getLogs,
  getNowStamp,
  getRandomString,
  getReportData,
  minifyURL
} = require('../util');

// CONSTANTS

const thisHost = process.env.THIS_KILOTEST_HOST;

// FUNCTIONS

// Returns a response to a target request.
exports.response = async args => {
  const [what = '', hostname = ''] = args;
  const hostLC = hostname.toLowerCase();
  const whatLC = what.toLowerCase();
  const matchingReports = [];
  // Get the non-hidden logs.
  const targetLogs = await getLogs();
  // For each log:
  for (const targetLog of targetLogs) {
    const {jobName} = targetLog;
    const [timeStamp, jobID] = jobName.split('-');
    const {superseded, url: reportURL, what: reportWhat} = targetLog;
    const reportHost = new URL(minifyURL(reportURL)).hostname;
    const reportWhatLC = reportWhat.toLowerCase();
    // If its description or hostname fragment matches the requested page:
    if (
      hostLC && (reportHost.includes(hostLC) || hostLC.includes(reportHost))
      || whatLC && (reportWhatLC.includes(whatLC) || whatLC.includes(reportWhatLC))
    ) {
      // Get data about its report.
      const data = await getReportData(timeStamp, jobID);
      const {
        creationDate,
        daysAgo,
        issueCount,
        toolNames,
        toolCount,
        reporterNames,
        reporterCount,
        violatorCount,
        preventedToolNames,
        preventedToolCount
      } = data;
      matchingReports.push({
        identifier: jobName,
        'creation date': creationDate,
        'days since the creation date': daysAgo,
        'tested web page': {
          description: reportWhat,
          URL: reportURL
        },
        'whether a later report about the same page exists': !! superseded,
        'rule engines that tried to test the page': {
          number: toolCount,
          names: toolNames
        },
        'rule engines that were unable to test the page': {
          number: preventedToolCount,
          names: preventedToolNames
        },
        'rule engines that reported issues': {
          number: reporterCount,
          names: reporterNames
        },
        'number of issues reported': issueCount,
        'number of HTML elements reported as exhibiting issues': violatorCount,
        'URLs for getting data about the reported issues': {
          'for you': `${thisHost}/api/reportIssues/${timeStamp}/${jobID}`,
          'for humans': `${thisHost}/reportIssues/${timeStamp}/${jobID}`
        },
        'URL for getting the full technical report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
      });
    }
  }
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by a language model to the Kilotest API. The model asked whether Kilotest had tested a specified web page for front-end quality (i.e. accessibility, usability, and standards conformity) and had made a report of the test results available. The response provides summary information about all and only the available reports of pages that match at least one of the provided fragments, where matching means either including or being included by the provided fragment, case-insensitively. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes API endpoints to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advantages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), whose home page contains an introduction and a link to a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'identifyReportsAboutMatchingWebPages',
    request: {
      'type of request': {
        identifier: 'target',
        description: 'Identify reports about matching web pages.'
      },
      method: 'POST',
      payload: {
        'all or part of a description of the web page': what,
        'all or part of the hostname of the URL of the web page': hostname
      },
      URLs: {
        'URL of your request': `${thisHost}/api/target`,
        'equivalent URL for humans': 'none'
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'reports, if any, that may match your page specifications': matchingReports
  };
  return content;
};
