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
const testaroAgentPW = process.env.TESTARO_AGENT_PW;

// IMPORTS
const {
  getJobNames,
  getJSON,
  getLogPath,
  getNowStamp,
  getObject,
  getPOSTData,
  getReportPath,
  isTimeStamp,
  isJobID
} = require('./util');
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
const serveError = async (error, response, isHumanUser = true) => {
  console.log(error.message);
  if (! response.writableEnded) {
    response.statusCode = 400;
    if (isHumanUser) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      const errorTemplate = await fs.readFile('error.html', 'utf8');
      const errorPage = errorTemplate.replace(/__error__/, error.message);
      response.end(errorPage);
    } else {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({error: error.message}));
    }
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
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-location', '/index.html');
      response.end(homePage);
    }
    // Otherwise, if it is an HTML page other than the home page:
    else if (pageName.endsWith('.html')) {
      const topic = pageName.slice(0, -5);
      // If the page can be generated:
      if (answer[topic]) {
        // Serve headers for a response.
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.setHeader('content-location', `${pathname}${search}`);
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
          await serveError({message: answerData.error}, response, true);
        }
      }
      // Otherwise, i.e. if the answer cannot be generated:
      else {
        // Report the error.
        await serveError({message: 'Invalid request'}, response, true);
      }
    }
    // Otherwise, if it is for the application icon:
    else if (pathname.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile(path.join(__dirname, 'favicon.ico'));
      // Serve it.
      response.setHeader('content-type', 'image/x-icon');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the stylesheet:
    else if (pathname === '/style.css') {
      try {
        // Serve it.
        const styleSheet = await fs.readFile('style.css', 'utf8');
        response.writeHead(200, {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'public, max-age=600'
        });
        response.end(styleSheet);
      }
      catch (error) {
        await serveError(error, response, true);
      }
    }
    // Otherwise, i.e. if it is any other GET request:
    else {
      const error = {
        message: `ERROR: Invalid GET request (${pathname}${search})`
      };
      // Report the error.
      await serveError(error, response, true);
    }
  }
  // Otherwise, if the request is a POST request:
  else if (method === 'POST') {
    // Get the data from the request body.
    const postData = await getPOSTData(request);
    // If the request is a retest recommendation:
    if (pageName === 'retestRec.html') {
      const {why} = postData;
      const [timeStamp, jobID] = pageArgs.split('/');
      // If the request is valid:
      if (isTimeStamp(timeStamp) && isJobID(jobID) && why) {
        // Serve headers for a response.
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.setHeader('content-location', `${pathname}${search}`);
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
          await serveError({message: answerData.error}, response, true);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid retest recommendation';
        await serveError({message}, response, true);
      }
    }
    // Otherwise, if it is a test recommendation:
    else if (pageName === 'testRec.html') {
      const {what, url, why} = postData;
      // If the request is valid:
      if (what && url.startsWith('https://') && why) {
        // Serve headers for a response.
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.setHeader('content-location', `${pathname}${search}`);
        // Get the answer data.
        const answerData = await require(path.join(__dirname, 'testRec', 'index'))
        .answer(what, url, why);
        // If they are valid:
        if (answerData.status === 'ok') {
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          // Report the error.
          await serveError({message: answerData.error}, response, true);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid test recommendation';
        await serveError({message}, response, true);
      }
    }
    // Otherwise, if it is a test order:
    else if (pageName === 'testOrder.html') {
      const {target, authCode} = postData;
      const [url, what] = target.split('\t');
      // If the request is valid:
      if (what && url.startsWith('https://') && authCode === process.env.AUTH_CODE) {
        // Serve headers for a response.
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.setHeader('content-location', `${pathname}${search}`);
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
          await serveError({message: answerData.error}, response, true);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        const message = 'Invalid test order';
        await serveError({message}, response, true);
      }
    }
    // Otherwise, if it is a request from a Testaro agent:
    else if (pageName === 'api') {
      const [agentID, service] = pageArgs.split('/');
      // If the agent is authorized:
      if (agentID === testaroAgent && postData.agentPW === testaroAgentPW) {
        // If the service is job assignment:
        if (service === 'job') {
          const messageStart = `Testaro agent ${agentID} requested a job, `;
          const jobNames = await getJobNames();
          const claimedJobNames = jobNames.claimed;
          // For each claimed job:
          for (const jobName of claimedJobNames) {
            const job = await getObject(path.join(jobsPath, 'claimed', jobName));
            const {id, sources} = job;
            const {agent} = sources;
            // If its assignee is the agent:
            if (agent === agentID) {
              const messageEnd = `but has not completed job ${id}`;
              // Report this.
              await serveError({message: `${messageStart}${messageEnd}`}, response, false);
            }
          }
          // If any jobs are claimed:
          if (claimedJobNames.length) {
            const messageEnd = 'but a job assigned to the agent was not completed';
            // Report this.
            await serveError({message: `${messageStart}${messageEnd}`}, response, false);
          }
          // Otherwise, i.e. if no jobs are claimed:
          else {
            const queuedJobNames = jobNames.queue;
            // If any jobs are queued:
            if (queuedJobNames.length) {
              const oldestJobName = queuedJobNames[0];
              // Get the first one.
              const firstJob = await getObject(path.join(queueDir, oldestJobName));
              // Add the agent ID to the job.
              firstJob.sources.agent = agentID;
              console.log(
                `Job ${firstJob.id} (${firstJob.target.what}) is being sent to the agent.`
              );
              // Assign the job to the agent.
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8'
              });
              response.end(JSON.stringify(firstJob));
              const messageEnd
              = `and job ${firstJob.id} (${firstJob.target.what}) was assigned to the agent`;
              console.log(`${messageStart}${messageEnd}`);
              // Move the job from the queue to the claimed-jobs directory.
              await fs.rename(
                path.join(queueDir, oldestJobName), path.join(claimedDir, oldestJobName)
              );
            }
            // Otherwise, i.e. if no jobs are queued:
            else {
              // Send a no-jobs response to the agent.
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8'
              });
              response.end(JSON.stringify({}));
              const messageEnd = 'but no job was in the queue';
              console.log(`${messageStart}${messageEnd}`);
            }
          }
        }
        // Otherwise, if the service is report acquisition:
        else if (service === 'report') {
          const {report} = postData;
          const {id, target} = report;
          const {what, url} = target;
          // If the request is valid:
          if (id) {
            // Acknowledge receipt.
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({status: 'ok'}));
            console.log(`Testaro report ${id} was received from Testaro agent ${agentID}`);
            const nowStamp = getNowStamp();
            const idParts = id.split('-');
            // Update the time-stamp part of its ID to ensure uniqueness.
            idParts[0] = nowStamp;
            const newID = idParts.join('-');
            report.id = newID;
            // Save the report.
            await fs.writeFile(getReportPath(... idParts), getJSON(report));
            // Create a log for the report.
            const log = {
              what,
              url
            };
            // Save the log.
            await fs.writeFile(getLogPath(... idParts), getJSON(log));
            // Annotate the report and mark it as annotated in the log.
            await annotateReport(... idParts);
            console.log(
              `Testaro report ${id} was annotated, saved, and logged with new ID ${newID}`
            );
            // Delete the job.
            await fs.unlink(path.join(claimedDir, `${id}.json`));
            console.log(`Completed job ${id} deleted`);
          }
          // Otherwise, i.e. if the request is invalid:
          else {
            const message = 'ERROR: Report submission invalid';
            await serveError({message}, response, false);
          }
        }
        // Otherwise, if the service is not valid:
        else {
          const message = 'ERROR: Invalid service request from Testaro agent';
          await serveError({message}, response, false);
        }
      }
      // Otherwise, i.e. if the agent is not authorized:
      else {
        const message = 'ERROR: Invalid Testaro agent';
        await serveError({message}, response, false);
      }
    }
    // Otherwise, i.e. if it is any other POST request:
    else {
      // Report its invalidity.
      const message = 'ERROR: Invalid POST request';
      await serveError({message}, response, false);
    }
  }
  // Otherwise, i.e. if it is neither a GET nor a POST request:
  else {
    // Report its invalidity.
    const message = 'ERROR: Invalid request method';
    await serveError({message}, response, false);
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
