/*
  form.js
  Serve the form for Kilotest Review.
*/

// ENVIRONMENT

// IMPORTS

// Module to access files.
const fs = require('fs/promises');
// Module to perform utility functions..
const {getPostData, serveError} = require('../util');

// FUNCTIONS

// Handles a request.
exports.devRequestHandler = async (request, response) => {
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If the request is a GET request:
  if (method === 'GET') {
    // If it is for the page-selection form:
    if (requestURL === '/review/index.html') {
      // Get the form page.
      let formPage = await fs.readFile(`${__dirname}/form.html`, 'utf8');
      const pageWhats = {};
      // Get the page descriptions and their file names.
      const logNames = await fs.readdir(`${__dirname}/../logs`);
      for (const logName of logNames) {
        const logPath = `${__dirname}/../logs/${logName}`;
        const logJSON = await fs.readFile(logPath, 'utf8');
        const log = JSON.parse(logJSON);
        const {pageWhat} = log;
        // Replace any earlier file name for the same page description.
        pageWhats[pageWhat] = logName;
      }
      const pageWhatLines = Object.keys(pageWhats).map(
        pageWhat => `<div><input type="radio" name="reportFileName" value="${pageWhats[pageWhat]}"> ${pageWhat}</div>`
      );
      // Insert radio buttons for the pages into the form page, with file names as values.
      formPage = formPage.replace(/__pageWhats__/, pageWhatLines.join('\n          '));
      // Serve it.
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Location', '/review/form.html');
      response.end(formPage);
    }
    // Otherwise, i.e. if it is invalid:
    else {
      const error = {
        message: `ERROR: Invalid request (${requestURL})`
      };
      // Report the error.
      console.log(error.message);
      await serveError(error, response);
    }
  }
  // Otherwise, if the request is a POST request:
  else if (method === 'POST') {
    // If the request is a review specification:
    if (requestURL === '/review/digest.html') {
      // Get the data from it.
      const postData = await getPostData(request);
      const {reportFileName} = postData;
      // If the request is valid:
      if (reportFileName) {
        // Get the scored report.
        const reportPath = `${__dirname}/../reports/${reportFileName}`;
        const reportJSON = await fs.readFile(reportPath, 'utf8');
        const report = JSON.parse(reportJSON);
        // Digest it.
        const reportDigest = await digest(digester, report, {
          title: 'Kilotest dev report',
          jobID: report.jobID,
          testDate: `20${report.jobData.endTime.slice(0, 8)}`,
          pageID: report.target.pageWhat,
          pageURL: report.target.pageURL,
          issueCount: Object.keys(report.score.details.issue).length,
          impact: report.score.summary.total,
          elapsedSeconds: report.jobData.elapsedSeconds,
          report: JSON.stringify(report, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        });
        // Serve the digest.
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Content-Location', '/review/form.html');
        response.end(reportDigest);
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report this.
        const error = {
          message: 'ERROR: invalid request'
        };
        await serveError(error, response);
      }
    }
  }
  // Otherwise, i.e. if it uses another method:
  else {
    // Report this.
    const error = {
      message: `ERROR: Request with prohibited method ${method} received`
    };
    await serveError(error, response);
  }
};
