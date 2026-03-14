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
const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const answer = {
  issues: require('./issues/index').answer,
  reportIssue: require('./reportIssue/index').answer,
  reportIssues: require('./reportIssues/index').answer,
  targets: require('./targets/index').answer,
  violatorRules: require('./violatorRules/index').answer
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
  const {method} = request;
  // If the request is a GET request:
  if (method === 'GET') {
    // Get its URL.
    const requestURL = new URL(request.url);
    const {pathname, search} = requestURL;
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
    else if (pathname.endsWith('.html')) {
      const topic = pathname.slice(0, -5);
      // If the page can be generated:
      if (answer[topic]) {
        // Serve headers for it.
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Content-Location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await answer[topic](pathname, search);
        // If it is valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if it is invalid:
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
    else if (requestURL.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile(`${__dirname}/favicon.ico`);
      // Serve it.
      response.setHeader('Content-Type', 'image/x-icon');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the stylesheet:
    else if (requestURL === '/style.css') {
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
        message: `ERROR: Invalid GET request (${requestURL})`
      };
      // Report the error.
      console.log(error.message);
      await serveError(error, response);
    }
  }
  // Otherwise, if the request is a POST request:
  else if (method === 'POST') {
    // Report invalidity.
    const message = 'ERROR: invalid POST request';
    console.log(message);
    await serveError(message, response);
  }
  // Otherwise, i.e. if it is any other request:
  else {
    // Report this.
    console.log(`ERROR: Request with prohibited method ${method} received`);
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
