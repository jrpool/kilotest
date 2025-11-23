/*
  index.js
  Manages Kilotest Screen.
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
// Functions from Testaro
const {doJob} = require('testaro/run');
// Custom digester.
const {digester} = require('./digesters/ks00/index');
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
exports.screenRequestHandler = async (request, response) => {
  // Get its method.
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If the request is a GET request:
  if (method === 'GET') {
    // If it is for the job-specification form:
    if (requestURL === '/screen/index.html') {
      // Get the form page.
      const formPage = await fs.readFile(`${__dirname}/index.html`, 'utf8');
      // Serve it.
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Location', '/screen/index.html');
      response.end(formPage);
    }
    // Otherwise, if it is for a stream of job events:
    else if (requestURL.startsWith('/screen/events/')) {
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
    // Otherwise, if it is for a comparison of job scores:
    else if (requestURL.startsWith('/screen/results/')) {
      // Get the request ID from the URL.
      const requestID = requestURL.split('/').pop();
      const resultsHTML = results.get(requestID);
      // If results for the request exist:
      if (resultsHTML) {
        // Serve them.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(resultsHTML);
        // Remove the results from memory.
        results.delete(requestID);
        return;
      }
      // Otherwise, i.e. if no result for the request exists:
      else {
        response.statusCode = 404;
        response.end('ERROR: No such result');
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
    // If the request is a comparison specification:
    if (requestURL === '/screen/progress.html') {
      // Get the data from it.
      const postData = await getPostData(request);
      // Get the statusus of the page requests.
      const pageStatuses = [1, 2, 3, 4, 5].map(num => {
        const what = postData[`pageWhat${num}`];
        const url = postData[`pageURL${num}`];
        if (! url && ! what) {
          return 'empty';
        }
        if (url && url.startsWith('https://') && what) {
          return 'valid';
        }
        return 'invalid';
      });
      // If only 0 or 1 request is non-empty:
      if (pageStatuses.filter(status => status === 'empty').length >= 4) {
        const error = {
          message: 'ERROR: Go back to specify at least 2 pages'
        };
        await serveError(error, response);
      }
      // Otherwise, if any request is invalid:
      else if (pageStatuses.includes('invalid')) {
        const error = {
          message: `ERROR: Go back to correct page ${pageStatuses.indexOf('invalid') + 1}`
        }
        await serveError(error, response);
      }
      // Otherwise, i.e. if all requests are valid and there are at least 2:
      else {
        // Get the requested page specifications.
        const pageSpecs = [1, 2, 3, 4, 5]
        .map(num => {
          return {
            num,
            what: postData[`pageWhat${num}`],
            url: postData[`pageURL${num}`]
          };
        })
        .filter(spec => pageStatuses[spec.num - 1] === 'valid');
        // Create a unique ID for the request.
        const requestID = Date.now().toString(36).slice(2, -1);
        // Serve a progress page.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        let progressPage = await fs.readFile(`${__dirname}/progress.html`, 'utf8');
        progressPage = progressPage.replace(/__requestID__/g, requestID);
        response.end(progressPage);
        console.log(`Waiting ${DEMO_SSE_DELAY}ms before publishing jobStart`);
        await new Promise(resolve => setTimeout(resolve, DEMO_SSE_DELAY));
        // Notify the client that the testing has started.
        publishEvent(requestID, {eventType: 'requestStart', payload: {}});
        // Create a target list from the page specifications.
        const targetList = pageSpecs.map(spec => ([spec.what, spec.url]));
        // Create a batch from the target list.
        const jobBatch = batch('jobTarget', 'job target', targetList);
        // Create a script for the jobs.
        const jobScript = script('jobScript', 'job script', 'default', {
          type: 'tools',
          specs: ['aslint', 'axe', 'ed11y', 'htmlcs']
        });
        // Merge the batch and the script into jobs.
        const jobs = merge(jobScript, jobBatch, '');
        const jobsData = [];
        let startTime = Date.now();
        // For each job:
        for (const job of jobs) {
          // Publish a progress event.
          publishEvent(requestID, {eventType: 'progress', payload: {type: 'page', which: job.target.what}});
          console.log(`Starting job for ${job.target.what}`);
          // Perform the job and get the report from Testaro.
          const report = await doJob(job);
          // Score the report in place.
          score(scorer, report);
          // Get the page specification and total score.
          jobsData.push({
            what: job.target.what,
            url: job.target.url,
            score: report.score.summary.total
          });
        }
        // Log the scores.
        const jobTimeLines = jobsData.map(job => `${job.what}: ${job.score}`).join('\n');
        console.log(`Job scores:\n${jobTimeLines}`);
        // Digest the results.
        jobsData.id = requestID;
        const resultsDigest = await digest(digester, jobsData, {
          requestID,
          testDate: new Date().toISOString().slice(0, 10),
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000)
        });
        // Tell the client to retrieve the digest.
        publishEvent(requestID, {
          eventType: 'digestDone',
          payload: {url: `/screen/results/${requestID}`}
        });
        // Store the digest HTML in memory for retrieval.
        results.set(requestID, resultsDigest);
      }
    }
  }
  // Otherwise, i.e. if it uses another method:
  else {
    // Report this.
    console.log(`ERROR: Request with prohibited method ${method} received`);
  }
};
