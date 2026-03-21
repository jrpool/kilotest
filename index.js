/*
  index.js
  Manages Kilotest.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config({quiet: true});

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';
const jobsDir = `${__dirname}/jobs`;
const queueDir = `${jobsDir}/queue`;
const claimedDir = `${jobsDir}/claimed`;
const testaroAgent = process.env.TESTARO_AGENT;

// IMPORTS
const {getJSON, getPOSTData, isTimeStamp, isJobID} = require('./util');
const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const answer = {
  diagnoses: require('./diagnoses/index').answer,
  issues: require('./issues/index').answer,
  orders: require('./orders/index').answer,
  reportIssue: require('./reportIssue/index').answer,
  reportIssues: require('./reportIssues/index').answer,
  recs: require('./recs/index').answer,
  retestRec: require('./retestRec/index').answer,
  retestRecForm: require('./retestRecForm/index').answer,
  rules: require('./rules/index').answer,
  targets: require('./targets/index').answer,
  testOrder: require('./testOrder/index').answer,
  testOrderForm: require('./testOrderForm/index').answer,
  testRec: require('./testRec/index').answer,
  testRecForm: require('./testRecForm/index').answer
};

// FUNCTIONS

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
// Handles a request.
const requestHandler = async (request, response) => {
  const {method, url} = request;
  const requestURL = new URL(url, 'https://localhost:3000');
  const {pathname, search} = requestURL;
  const pageName = pathname.split('/')[1];
  const pageArgs = pathname.split('/').slice(2).join('/');
  // If the request is a GET request:
  if (method === 'GET') {
    // Get its URL.
    // If it is the home page:
    if (['/', '/index.html'].includes(pathname)) {
      // Get the home page.
      const homePage = await fs.readFile('index.html', 'utf8');
      // Serve it.
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Location', '/index.html');
      response.end(homePage);
    }
    // Otherwise, if it is an HTML page other than the home page:
    else if (pageName.endsWith('.html')) {
      const topic = pageName.slice(0, -5);
      // If the page can be generated:
      if (answer[topic]) {
        // Serve headers for a response.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await answer[topic](pageArgs, search);
        // If they are valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          // Report the error.
          console.log(answerData.error);
          await serveError({message: answerData.error}, response);
        }
      }
      // Otherwise, i.e. if the answer cannot be generated:
      else {
        // Report the error.
        console.log('ERROR: Invalid request');
        await serveError({message: 'Invalid request'}, response);
      }
    }
    // Otherwise, if it is for the application icon:
    else if (pathname.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile(path.join(__dirname, 'favicon.ico'));
      // Serve it.
      response.setHeader('Content-Type', 'image/x-icon');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the stylesheet:
    else if (pathname === '/style.css') {
      try {
        // Serve it.
        const styleSheet = await fs.readFile('style.css', 'utf8');
        response.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'public, max-age=600'
        });
        response.end(styleSheet);
      }
      catch (error) {
        await serveError(error, response);
      }
    }
    // Otherwise, if it a valid request from Testaro for a job:
    else if (pathname === '/job' && pageArgs === testaroAgent) {
      const claimedJobNames = await fs.readdir(claimedDir);
      // If any jobs are claimed:
      if (claimedJobNames.length) {
        // Report this.
        console.log('ERROR: Testaro requested a job before finishing another job');
        // Refuse the request.
        response.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8'
        });
        response.end('ERROR: You requested a job before finishing another job');
      }
      // Otherwise, i.e. if no jobs are claimed:
      else {
        const queuedJobNames = await fs.readdir(queueDir);
        // If any jobs are queued:
        if (queuedJobNames.length) {
          const oldestJobName = queuedJobNames[0];
          const firstJob = await fs.readFile(`${queueDir}/${oldestJobName}`, 'utf8');
          // Send the first one to Testaro.
          response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8'
          });
          response.end(firstJob);
          // Move the job from the queue to the claimed-jobs directory.
          await fs.rename(`${queueDir}/${oldestJobName}`, `${claimedDir}/${oldestJobName}`);
        }
        // Otherwise, i.e. if no jobs are queued:
        else {
          // Send a no-jobs response.
          response.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8'
          });
          response.end('');
        }
      }
    }
    // Otherwise, i.e. if it is any other GET request:
    else {
      const error = {
        message: `ERROR: Invalid GET request (${pathname}${search})`
      };
      // Report the error.
      console.log(error.message);
      await serveError(error, response);
    }
  }
  // Otherwise, if the request is a POST request:
  else if (method === 'POST') {
    // Get the data from the request body.
    const postData = await getPOSTData(request);
    // If the request is a retest recommendation:
    if (pageName === 'retestRec.html') {
      const {authCode, why} = postData;
      const [timeStamp, jobID] = pageArgs.split('/');
      // If the request is valid:
      if (isTimeStamp(timeStamp) && isJobID(jobID) && why && authCode === process.env.AUTH_CODE) {
        // Serve headers for a response.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await require(path.join(__dirname, 'retestRec', 'index'))
        .answer(pageArgs, why);
        // If they are valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          // Report the error.
          console.log(answerData.error);
          await serveError({message: answerData.error}, response);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid retest recommendation';
        console.log(`ERROR: ${message}`);
        await serveError({message}, response);
      }
    }
    // Otherwise, if it is a test recommendation:
    else if (pageName === 'testRec.html') {
      const {what, url, why} = postData;
      // If the request is valid:
      if (what && url.startsWith('https://') && why) {
        // Serve headers for a response.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await require(path.join(__dirname, 'testRec', 'index'))
        .answer(pageArgs, why);
        // If they are valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          // Report the error.
          console.log(answerData.error);
          await serveError({message: answerData.error}, response);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid test recommendation';
        console.log(`ERROR: ${message}`);
        await serveError({message}, response);
      }
    }
    // Otherwise, if it is a test order:
    else if (pageName === 'testOrder.html') {
      const {target, authCode} = postData;
      const [url, what] = target.split('\t');
      // If the request is valid:
      if (what && url.startsWith('https://') && authCode === process.env.AUTH_CODE) {
        // Serve headers for a response.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await require(path.join(__dirname, 'testOrder', 'index'))
        .answer(url, what, authCode);
        // If the answer data are valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          // Report the error.
          console.log(answerData.error);
          await serveError({message: answerData.error}, response);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid test order';
        console.log(`ERROR: ${message}`);
        await serveError({message}, response);
      }
    }
    // Otherwise, if it is a Testaro report:
    else if (pathname === '/report' && pageArgs === testaroAgent) {
      const {agentPW, report} = await getPOSTData(request);
      const {id} = report;
      // If the request is valid:
      if (id && agentPW === `process.env.${testaroAgent}_AGENT_PW`) {
        console.log(`Testaro report ${id} received`);
        // Save the report.
        await fs.writeFile(`${__dirname}/reports/${id}.json`, getJSON(report));
        // Acknowledge receipt.
        response.end('ok');
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        const message = 'Report submission invalid';
        console.log(`ERROR: ${message}`);
        // Refuse the request.
        response.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8'
        });
        response.end('Report submission invalid');
      }
    }
    // Otherwise, i.e. if the POST request is any other request:
    else {
      // Report its invalidity.
      const message = 'ERROR: invalid POST request';
      console.log(message);
      // Send an error response.
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end('');
      await serveError(message, response);
    }
  }
  // Otherwise, i.e. if the request method is neither GET nor POST:
  else {
    // Report its invalidity.
    const message = 'ERROR: invalid request method';
    console.log(message);
    await serveError(message, response);
  }
};

// SERVER

const serve = (protocolModule, options) => {
  const server = protocolModule === 'https'
    ? https.createServer(options, requestHandler)
    : http.createServer(requestHandler);
  const port = process.env.PORT || '3000';
  server.listen(port, () => {
    console.log(`Kilotest server listening at ${protocol}://localhost:${port}.`);
  });
};
if (protocol === 'http') {
  console.log('Starting HTTP server');
  serve(http, {});
}
else if (protocol === 'https') {
  console.log('Starting HTTPS server');
  fs.readFile(process.env.KEY, 'utf8')
  .then(
    key => {
      fs.readFile(process.env.CERT, 'utf8')
      .then(
        cert => {
          serve(https, {key, cert});
        },
        error => console.log(error.message)
      );
    },
    error => console.log(error.message)
  );
}
