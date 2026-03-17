/*
  index.js
  Manages Kilotest.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config({quiet: true});

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';

// IMPORTS
const {isTimeStamp, isJobID} = require('./util');
const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const answer = {
  issues: require('./issues/index').answer,
  reportIssue: require('./reportIssue/index').answer,
  reportIssues: require('./reportIssues/index').answer,
  retests: require('./retests/index').answer,
  rules: require('./rules/index').answer,
  targets: require('./targets/index').answer,
  diagnoses: require('./diagnoses/index').answer
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
      const icon = await fs.readFile(`${__dirname}/favicon.ico`);
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
    // Assemble the request body from its readable stream.
    const bodyParts = [];
    request.on('data', chunk => {
      bodyParts.push(chunk);
    });
    request.on('end', async () => {
      const body = bodyParts.join('');
      const query = querystring.parse(body);
      const {why} = query;
      const [timeStamp, jobID] = pageArgs.split('/');
      // If the request is a valid retest recommendation:
      if (
        pageName === 'retest.html'
        && isTimeStamp(timeStamp)
        && isJobID(jobID)
        && why
      ) {
        // Serve headers for a response.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', pathname);
        // Get the answer data.
        const answerData = require('./retest/index').answer(pageArgs, why);
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
      // Otherwise, i.e. if the POST request is any other request:
      else {
        // Report its invalidity.
        const message = 'ERROR: invalid POST request';
        console.log(message);
        await serveError(message, response);
      }
    });
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
