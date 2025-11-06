/*
  index.js
  Manages Kilotest.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config({quiet: true});

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';
const eventStreams = new Map();
const results = new Map();

// IMPORTS
// Module to access files.
const fs = require('fs/promises');
// Module to create an HTTP server and client.
const http = require('http');
// Module to create an HTTPS server and client.
const https = require('https');
// Functions from Testilo.
const {batch} = require('testilo/batch');
const {script} = require('testilo/script');
const {merge} = require('testilo/merge');
const {score} = require('testilo/score');
const {digest} = require('testilo/digest');
const {scorer} = require('testilo/procs/score/tsp');
const {digester} = require('../digesters/kd00/index');
// Functions from Testaro
const {doJob} = require('testaro/run');
// Temporary import.
const DEMO_SSE_DELAY = parseInt(process.env.DEMO_SSE_DELAY || '2000', 10);

// FUNCTIONS

// Publishes an event to all clients connected to an event stream.
const publishEvent = (jobID, event) => {
  // Get the response sinks for the job.
  const sinks = eventStreams.get(jobID) || [];
  // Create the payload.
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of sinks) {
    try {
      response.write(payload);
    }
    catch (error) {}
  };
}

// Serves an error message.
const serveError = async (error, response) => {
  console.log(error.message);
  if (! response.writableEnded) {
    response.statusCode = 400;
    const errorTemplate = await fs.readFile('error.html', 'utf8');
    const errorPage = errorTemplate.replace(/__error__/, error.message);
    response.end(errorPage);
  }
};
// Gets the data from a POST request.
const getPostData = async request => {
  return new Promise((resolve, reject) => {
    const bodyParts = [];
    request.on('error', async err => {
      reject(err);
    })
    .on('data', chunk => {
      bodyParts.push(chunk);
    })
    // When the request has arrived:
    .on('end', async () => {
      try {
        // Get a query string from the request body.
        const queryString = Buffer.concat(bodyParts).toString();
        // Parse it as an array of key-value pairs.
        const requestParams = new URLSearchParams(queryString);
        // Convert it to an object with string-valued properties.
        const postData = {};
        requestParams.forEach((value, name) => {
          postData[name] = value;
        });
        resolve(postData);
      }
      catch (err) {
        reject(err);
      }
    });
  });
};
// Handles a request.
exports.devRequestHandler = async (request, response) => {
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If the request is a GET request:
  if (method === 'GET') {
    // If it is for the job-specification form:
    if (requestURL === '/dev/index.html') {
      // Get the form page.
      const formPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
      // Serve it.
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Location', '/dev/index.html');
      response.end(formPage);
    }
    // Otherwise, if it is for a stream of job events:
    else if (requestURL.startsWith('/dev/events/')) {
      // Get the job ID from the URL.
      const jobID = requestURL.split('/').pop();
      // Set the response headers for an event stream.
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      response.write('\n');
      const sinks = eventStreams.get(jobID) || [];
      sinks.push(response);
      eventStreams.set(jobID, sinks);
      // When the client disconnects:
      request.on('close', () => {
        // Remove the response from the list of sinks for that job ID.
        const sinks = eventStreams.get(jobID) || [];
        const remaining = sinks.filter(r => r !== response);
        if (remaining.length) {
          eventStreams.set(jobID, remaining);
        }
        else {
          eventStreams.delete(jobID);
        }
        return;
      });
    }
    // Otherwise, if it is for job results:
    else if (requestURL.startsWith('/dev/results/')) {
      // Get the job ID from the URL.
      const jobID = requestURL.split('/').pop();
      const resultsHTML = results.get(jobID);
      // If a result for the job exists:
      if (resultsHTML) {
        // Serve it.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(resultsHTML);
        // Remove the results from memory.
        results.delete(jobID);
        return;
      }
      // Otherwise, i.e. if no result for the job exists:
      else {
        response.statusCode = 404;
        response.end('ERROR: No such job result');
        return;
      }
    }
    // Otherwise, i.e. if it is any other GET request:
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
    // If the request is a job specification:
    if (requestURL === '/dev/progress.html') {
      // Get the data from it.
      const postData = await getPostData(request);
      const {pageWhat, pageURL} = postData;
      // If the request is valid:
      if (pageURL && pageURL.startsWith('http') && pageWhat) {
        // Create a unique ID for the job.
        const jobID = Date.now().toString(36).slice(2, -1);
        console.log(`Request to test ${pageWhat} (${pageURL}) assigned to job ${jobID}`);
        // Serve a progress page.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        let progressPage = await fs.readFile(`${__dirname}/progress.html`, 'utf8');
        progressPage = progressPage.replace(/__jobID__/g, jobID);
        response.end(progressPage);
        console.log(`Waiting ${DEMO_SSE_DELAY}ms before publishing jobStart`);
        await new Promise(resolve => setTimeout(resolve, DEMO_SSE_DELAY));
        // Notify the client that the job has started.
        publishEvent(jobID, {eventType: 'jobStart', payload: {}});
        // Create a target list from it.
        const targetList = [[pageWhat, pageURL]];
        // Create a batch from the target list.
        const jobBatch = batch('jobTarget', 'job target', targetList);
        // Create a script for the job.
        const jobScript = script('jobScript', 'job script', 'default', {
          type: 'tools',
          specs: [
            'alfa', 'aslint', 'axe', 'ed11y', 'htmlcs', 'ibm', 'nuVal', 'qualWeb', 'testaro', 'wax'
          ]
        });
        // Specify granular reporting.
        jobScript.observe = true;
        // Merge the batch and the script into a job.
        const job = merge(jobScript, jobBatch, '')[0];
        // Perform the job, publish its progress events, and get the report from Testaro.
        const jobOpts = {
          onProgress: payload => {
            publishEvent(jobID, {eventType: 'progress', payload});
          }
        };
        const report = await doJob(job, jobOpts);
        // Score the report in place.
        score(scorer, report);
        // Digest the scored report.
        const jobDigest = await digest(digester, report, {
          title: 'Kilotest dev report',
          mainHeading: 'Kilotest dev report',
          metadataHeading: 'Test facts',
          jobID,
          testDate: new Date().toISOString().slice(0, 10),
          pageID: pageWhat,
          pageURL,
          issueCount: Object.keys(report.score.details.issue).length,
          impact: report.score.summary.total,
          elapsedSeconds: report.jobData.elapsedSeconds,
          report: JSON.stringify(report, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        });
        // Tell the client to retrieve the digest.
        publishEvent(jobID, {
          eventType: 'digestDone',
          payload: {url: `/dev/results/${jobID}`}
        });
        // Store the digest HTML in memory for retrieval.
        results.set(jobID, jobDigest);
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report this.
        const message = 'ERROR: invalid request';
        console.log(message);
        await serveError(message, response);
      }
    }
  }
  // Otherwise, i.e. if it uses another method:
  else {
    // Report this.
    console.log(`ERROR: Request with prohibited method ${method} received`);
  }
};
