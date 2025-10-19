/*
  index.js
  Manages Kilotest.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config();

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';
const resultStreams = {};

// IMPORTS
// Module to access files.
const fs = require('fs/promises');
// Module to create an HTTP server and client.
const http = require('http');
// Module to create an HTTPS server and client.
const https = require('https');
// URL of Kilotest.
process.env.APP_URL ??= 'http://localhost:3000/kilotest';
// Functions from Testilo.
const {batch} = require('testilo/batch');
const {script} = require('testilo/script');
const {merge} = require('testilo/merge');
const {score} = require('testilo/score');
const {digest} = require('testilo/digest');
const {scorer} = require('testilo/procs/score/tsp');
const {digester} = require('testilo/procs/digest/tdpi');
// Functions from Testaro
const {doJob} = require('testaro/run');

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
const requestHandler = async (request, response) => {
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If the URL has a path that ends with a slash:
  if (requestURL.length > 1 && requestURL.endsWith('/')) {
    // Redirect the client permanently.
    response.writeHead(301, {'Location': requestURL.slice(0, -1)});
    response.end();
  }
  // Otherwise, if the request is a GET request:
  else if (method === 'GET') {
    // If it is for the stylesheet:
    if (requestURL === '/kilotest/style.css') {
      // Serve it.
      const styleSheet = await fs.readFile('style.css', 'utf8');
      response.end(styleSheet);
    }
    // Otherwise, if it is for the application icon:
    else if (requestURL.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile('favicon.ico');
      // Serve it.
      response.setHeader('Content-Type', 'image/x-icon');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the job-specification form:
    else if (['/kilotest', '/kilotest/index.html'].includes(requestURL)) {
      // Serve it.
      const formPage = await fs.readFile(`index.html`, 'utf8');
      response.setHeader('Content-Location', '/kilotest');
      response.end(formPage);
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
    if (requestURL === '/kilotest/result.html') {
      // Get the data from it.
      const postData = await getPostData(request);
      const {pageWhat, pageURL} = postData;
      // If the request is valid:
      if (pageURL && pageURL.startsWith('http') && pageWhat) {
        console.log(`Request submitted to test ${pageWhat} (${pageURL})`);
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
        // Merge the batch and the script into a job.
        const job = merge(jobScript, jobBatch, '')[0];
        // Perform the job and get the report from Testaro.
        const report = await doJob(job);
        // Score the report in place.
        score(scorer, report);
        // Digest the scored report.
        const jobDigest = await digest(digester, report, {
          title: 'Kilotest report',
          mainHeading: 'Kilotest report',
          metadataHeading: 'Test facts',
          testDate: new Date().toLocaleString(),
          pageID: pageWhat,
          pageURL,
          dataHeading: 'Issues reported'
        });
        // Serve the digest.
        response.setHeader('Content-Type', 'text/html');
        response.end(jobDigest);
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
// ########## SERVER
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
