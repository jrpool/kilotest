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
const {batch, script, merge, score, digest} = require('testilo');
const {scorer} = require('testilo/procs/score/tsp');
const {digester} = require('testilo/procs/digest/tdp');

// FUNCTIONS

// Serves an error message.
const serveError = async (error, response) => {
  console.log(error.message);
  if (! response.writableEnded) {
    response.statusCode = 400;
    const errorTemplate = await fs.readFile('error.html', 'utf8');
    const errorPage = errorTemplate.replace(/__error__/, error);
    response.end(errorPage);
  }
};
// Gets the data from a POST request.
const getPostData = async (request) => {
  const bodyParts = [];
  request.on('error', async err => {
    await serveError(err, response);
  })
  .on('data', chunk => {
    bodyParts.push(chunk);
  })
  // When the request has arrived:
  .on('end', async () => {
    // Get a query string from the request body.
    const queryString = Buffer.concat(bodyParts).toString();
    // Parse it as an array of key-value pairs.
    const requestParams = new URLSearchParams(queryString);
    // Convert it to an object with string- or array-valued properties.
    const postData = {};
    requestParams.forEach((value, name) => {
      postData[name] = value;
    });
    return postData;
  });
};
// Handles a request.
const requestHandler = async (request, response) => {
  const {method} = request;
  // Get its URL.
  const requestURL = request.url;
  // If the URL ends with a slash:
  if (requestURL.endsWith('/')) {
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
        message: `ERROR: Invalid request (${requestPath})`
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
        console.log(`Job submitted to test ${pageWhat} (${pageURL})`);
        // Convert it to a Testaro job.
        const jobBatch = batch(
          'testuList', '1 target', [[pageWhat, pageURL]]
        );
        // Create a script.
        const scriptObj = script('testu', pageWhat, 'default', {});
        try{
          // Create a job from the script and the batch.
          const job = merge(scriptObj, jobBatch, '')[0];
          job.sendReportTo = `${process.env.APP_URL}/api/report`;
          // Add it to the jobs to be done.
          jobs.todo[job.id] = job;
          // Serve a result page to the requester.
          const resultTemplate = await fs.readFile('result.html', 'utf8');
          const resultPage = resultTemplate
          .replace('__pageWhat__', requestData.pageWhat)
          .replace('__pageURL__', requestData.pageURL)
          .replace(/__jobID__/g, job.id);
          response.setHeader('Content-Location', '/testu/result.html');
          response.end(resultPage);
          console.log(`Result page initialized and served`);
        }
        catch(error) {
          await serveError(`ERROR creating job (${error.message})`, response);
        }
      }
        // Otherwise, i.e. if the request is invalid:
        else {
          // Report this to the requester.
          const message = 'ERROR: invalid request';
          console.log(message);
          await serveError(message, response);
        }
      }
      // Otherwise, if the request is a job report from a testing agent:
      else if (requestURL === '/testu/api/report') {
        // Process the report.
        const reportJSON = Buffer.concat(bodyParts).toString();
        try {
          // If it is valid:
          const report = JSON.parse(reportJSON);
          const {id, sources} = report;
          const {agent} = sources;
          if (
            report && reportProperties.every(propertyName => Object.hasOwn(report, propertyName))
          ) {
            // Send an acknowledgement to the agent.
            serveObject({
              message: `Report ${id} received and validated`
            }, response);
            console.log(`Valid report ${id} received from agent ${agent}`);
            // Notify the requester.
            resultStreams[id].write(`data: Report ${id} received from Testaro agent ${agent}.\n\n`);
            // Score and save it.
            await fs.mkdir('reports', {recursive: true});
            score(scorer, report);
            await fs.writeFile(`reports/${id}.json`, `${JSON.stringify(report, null, 2)}\n`);
            // Notify the requester.
            console.log('Report scored');
            resultStreams[id].write('data: Report scored.\n\n');
            // Digest it and save the digest.
            const jobDigest = await digest(digester, report);
            await fs.writeFile(`reports/${id}.html`, jobDigest);
            // Notify the requester.
            const digestURL = `${process.env.APP_URL}/digest?jobID=${id}`;
            console.log('Report digested');
            resultStreams[id].write(
              `data: Report digested. <a href="${digestURL}">Get the digest</a>.\n\n`
            );
            // Close the event source for the requester.
            resultStreams[id].end();
            console.log(`Requester notified that job ${id} is complete\n`);
          }
          // Otherwise, i.e. if the report is invalid:
          else {
            // Report this.
            const message = 'ERROR: Invalid job report received';
            console.log(message);
            serveObject({message}, response);
          }
        }
        // If the processing fails:
        catch(error) {
          // Report this.
          const message = 'ERROR: Report processing failed';
          console.log(`${message} (${error.message})`);
        }
      }
    });
  }
  // Otherwise, i.e. if it uses another method:
  else {
    // Report this.
    console.log(`ERROR: Request with prohibited method ${method} received`);
  }
};
// ########## SERVER
const serve = (protocolModule, options) => {
  const server = protocolModule.createServer(options, requestHandler);
  const port = process.env.PORT || '3008';
  server.listen(port, () => {
    console.log(`Testu server listening at ${protocol}://localhost:${port}.`);
  });
};
if (protocol === 'http') {
  serve(http, {});
}
else if (protocol === 'https') {
  globals.fs.readFile(process.env.KEY, 'utf8')
  .then(
    key => {
      globals.fs.readFile(process.env.CERT, 'utf8')
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
