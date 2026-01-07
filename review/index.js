/*
  form.js
  Serve the form for Kilotest Review.
*/

// ENVIRONMENT

// IMPORTS

// Module to access files.
const fs = require('fs/promises');
// Module to digest a report.
const {digester} = require('../dev/digesters/kd00/index');
// Module to perform utility functions.
const {digest, getPostData, serveError} = require('../util');

// FUNCTIONS

// Handles a request.
exports.reviewRequestHandler = async (request, response) => {
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If it is valid:
  if (requestURL === '/review/index.html') {
    // If the request is a GET request and therefore for the review form:
    if (method === 'GET') {
      // Get the form page.
      let formPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
      const pageWhats = {};
      // Get the page descriptions and their file names.
      const reportNames = await fs.readdir(`${__dirname}/../reports`);
      for (const reportName of reportNames) {
        const logPath = `${__dirname}/../logs/${reportName}`;
        const logJSON = await fs.readFile(logPath, 'utf8');
        const log = JSON.parse(logJSON);
        const {pageWhat} = log;
        // Replace any earlier file name for the same page description.
        pageWhats[pageWhat] = reportName;
      }
      const pageWhatLines = Object.keys(pageWhats).sort().map(
        pageWhat => {
          const reportName = pageWhats[pageWhat];
          return `<div><input type="radio" name="reportName" value="${reportName}" required> ${pageWhat}</div>`;
        }
      );
      // Insert radio buttons for the pages into the form page, with report names as values.
      formPage = formPage.replace(/__pageWhats__/, pageWhatLines.join('\n          '));
      // Serve the form page.
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Location', '/review/form.html');
      response.end(formPage);
    }
    // Otherwise, if the request is a POST request:
    else if (method === 'POST') {
      // Get the data from it.
      const postData = await getPostData(request);
      const {reportName} = postData;
      // If the request is valid:
      if (reportName) {
        // Get the scored report.
        const reportPath = `${__dirname}/../reports/${reportName}`;
        const reportJSON = await fs.readFile(reportPath, 'utf8');
        // If it exists:
        if (reportJSON) {
          try {
            const report = JSON.parse(reportJSON);
            // Digest it.
            const reportDigest = await digest(digester, report, {
              title: 'Kilotest dev report',
              jobID: report.id,
              testDate: `20${report.jobData.endTime.slice(0, 8)}`,
              pageID: report.target.what,
              pageURL: report.target.url,
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
          // If digesting fails because the report is not JSON or otherwise:
          catch (error) {
            // Report this.
            await serveError(error, response);
          }
        }
        // Otherwise, i.e. if it does not exist:
        else {
          // Report this.
          await serveError('Requested report not found', response);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report this.
        const error = {
          message: 'Invalid POST request'
        };
        await serveError(error, response);
      }
    }
    // Otherwise, i.e. if it uses another method:
    else {
      // Report this.
      const error = {
        message: `Request with prohibited method ${method} received`
      };
      await serveError(error, response);
    }
  }
  // Otherwise, i.e. if the URL is invalid:
  else {
    // Report this.
    const error = {
      message: `Invalid request (${requestURL})`
    };
    await serveError(error, response);
  }
};
