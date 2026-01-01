/*
  index.js
  Manages Kilotest Dev.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config({quiet: true});

// CONSTANTS

const eventStreams = new Map();
const results = new Map();

// IMPORTS
// Module to access files.
const fs = require('fs/promises');
// Functions from Testilo.
const {batch} = require('testilo/batch');
const {script} = require('testilo/script');
const {merge} = require('testilo/merge');
const {score} = require('testilo/score');
const {digest} = require('testilo/digest');
const {scorer} = require('testilo/procs/score/tsp');
const {digester} = require('./digesters/kd00/index');
// Functions from Testaro
const {doJob} = require('testaro/run');
// Temporary import.
const DEMO_SSE_DELAY = Number.parseInt(process.env.DEMO_SSE_DELAY || '2000', 10);

// VARIABLES

// Time when the last anonymous job started.
let lastAnonymousJob = Date.now() - 650000;

// FUNCTIONS

// Publishes an event to all clients connected to the event stream of a job.
const publishEvent = (jobID, event) => {
  // Get the response sinks for the job.
  const sinks = eventStreams.get(jobID) || [];
  // Create the payload.
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  // For each response sink:
  for (const response of sinks) {
    // Send the payload.
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
      const {authCode, pageWhat, pageURL} = postData;
      const authCodeGood = authCode === process.env.AUTH_CODE;
      const authCodeBad = authCode && ! authCodeGood;
      // If the request is valid:
      if (pageURL && pageURL.startsWith('http') && pageWhat) {
        // Modify the required wait by a random amount to prevent denials of service.
        const waitAdjustment = 100000 * Math.random() - 50000;
        // If an invalid authorization code was specified:
        if (authCodeBad) {
          // Report this.
          const error = {
            message: 'ERROR: invalid authorization code'
          };
          await serveError(error, response);
        }
        // Otherwise, if the request is anonymous and too early:
        else if (! authCode && Date.now() + waitAdjustment - lastAnonymousJob < 600000) {
          // Report this.
          const error = {
            message: 'ERROR: Requests too frequest; please wait about 10 minutes'
          };
          await serveError(error, response);
        }
        // Otherwise, i.e. if a valid authorization code was specified or unnecessary:
        else {
          // If the request is anonymous:
          if (! authCode) {
            // Update the last anonymous job start time.
            lastAnonymousJob = Date.now();
          }
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
          // Create a target list.
          const targetList = [[pageWhat, pageURL]];
          // Create a batch from the target list.
          const jobBatch = batch('jobTarget', 'job target', targetList);
          // Create a script for the job.
          const jobScript = script('jobScript', 'job script', 'default', {
            type: 'tools',
            specs: [
              'alfa',
              'aslint',
              'axe',
              'ed11y',
              'htmlcs',
              'ibm',
              'nuVal',
              'nuVnu',
              'qualWeb',
              'testaro',
              'wax'
            ]
          });
          // Specify granular reporting.
          jobScript.observe = true;
          // Merge the batch and the script into a job.
          const job = merge(jobScript, jobBatch, '')[0];
          // Make the job publish its progress events.
          const jobOpts = {
            onProgress: payload => {
              publishEvent(jobID, {eventType: 'progress', payload});
            }
          };
          // Perform the job and get its report.
          const report = await doJob(job, jobOpts);
          // Score the report in place.
          score(scorer, report);
          // Digest the scored report.
          const jobDigest = await digest(digester, report, {
            title: 'Kilotest dev report',
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
