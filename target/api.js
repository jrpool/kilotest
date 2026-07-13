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
  const [description = '', hostname = ''] = args;
  const hostLC = hostname.toLowerCase();
  const whatLC = description.toLowerCase();
  // Initialize an array of summaries of matching reports.
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
        error,
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
      // If this failed:
      if (error) {
        // Report why.
        console.error(error);
      }
      // Otherwise, i.e. if it succeeded:
      else {
        // Add a report summary to the array.
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
            'for you': `${thisHost}/api/reportFacts/${timeStamp}/${jobID}`,
            'for humans': `${thisHost}/reportIssues.html/${timeStamp}/${jobID}`
          },
          'URL for getting the full technical report as JSON': `${thisHost}/fullReport.json/${timeStamp}/${jobID}`
        });
      }
    }
  }
  // Get a response.
  const content = {
    summary: `This document fulfills a request made by a language model to the Kilotest API. The model asked whether Kilotest had tested a specified web page for front-end quality (i.e. accessibility, usability, and standards conformity) and had made a report of the test results available. The response provides summary information about all and only the available reports of pages that match at least one of the provided fragments, where matching means either including or being included by the provided fragment, case-insensitively. Kilotest, with the help of Testaro, Testilo, and an ensemble of ten rule engines, performs tests on web pages, using a combination of rule- and machine-learning-based methods, and produces reports. Kilotest exposes API endpoints to recommend web pages for testing and to obtain information from Kilotest reports. To learn more about Kilotest and the advantages of testing with an ensemble of rule engines, visit the deployed instance of Kilotest (${process.env.DEPLOYED_KILOTEST_HOST}), whose home page contains an introduction and a link to a tutorial.`,
    'tool collection name': 'Kilotest',
    'tool name': 'summarizeQualityOfMatchingWebPages',
    request: {
      'type of request': {
        identifier: 'target',
        description: 'Summarize the quality of matching web pages.'
      },
      method: 'POST',
      payload: {
        description,
        hostname
      },
      URLs: {
        'for you': `${thisHost}/api/target`,
        'for humans': 'none'
      },
      'closest ancestor request': null
    },
    'response metadata': {
      identifier: `${getNowStamp()}-${getRandomString(3)}`,
      'date and time': new Date().toISOString(),
    },
    'matching reports': matchingReports
  };
  return content;
};
