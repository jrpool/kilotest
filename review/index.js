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
// Functions to score a report.
const {score} = require('testilo/score');
const {scorer} = require('testilo/procs/score/tsp');
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
    // If the request is a GET request:
    if (method === 'GET') {
      // If it requests the review form:
      if (requestURL === '/review/index.html') {
        // Get the form page.
        let formPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
        // Initialize a directory of page descriptions and their latest file names.
        const pageWhats = {};
        // Get the names of the report files.
        const reportNames = await fs.readdir(`${__dirname}/../reports`);
        // For each of them:
        for (const reportName of reportNames) {
          const logPath = `${__dirname}/../logs/${reportName}`;
          // Get the corresponding log.
          const logJSON = await fs.readFile(logPath, 'utf8');
          const log = JSON.parse(logJSON);
          const {pageWhat} = log;
          // Add the page description to the directory or update its file name.
          pageWhats[pageWhat] = reportName;
        }
        const pageWhatLines = Object.keys(pageWhats).sort().map(
          pageWhat => {
            const reportID = pageWhats[pageWhat].slice(0, -5);
            return `<li><a href="/review/digest/${reportID}">${pageWhat}</a></li>`;
          }
        );
        // Insert links to the available digests into the form page.
        formPage = formPage.replace(/__pageWhats__/, pageWhatLines.join('\n          '));
        // Serve the form page.
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Content-Location', '/review/form.html');
        response.end(formPage);
      }
      // Otherwise, if it requests a digest:
      else if (requestURL.startsWith('/review/digest/')) {
        // Get the report name.
        const reportName = `${requestURL.replace('/review/digest/', '')}.json`;
        // Get the scored report.
        const reportPath = `${__dirname}/../reports/${reportName}`;
        const reportJSON = await fs.readFile(reportPath, 'utf8');
        // If it exists:
        if (reportJSON) {
          try {
            const report = JSON.parse(reportJSON);
            // If it has been scored without reporter classification of issue elements:
            if (Object.values(report.score.details.element).some(data => Array.isArray(data))) {
              // Rescore it.
              score(scorer, report);
            }
            // Digest it.
            const reportDigest = await digest(digester, report, {
              title: `${report.target.what} | Kilotest Dev report`,
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
          message: 'Invalid request'
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
