/*
  index.js
  Manages Kilotest.
*/

// ENVIRONMENT

// Module to keep secrets local.
require('dotenv').config({quiet: true});

// IMPORTS
const {
  annotateReport,
  getJobNames,
  getJSON,
  getLogPath,
  getObject,
  getPOSTData,
  getReportPath,
  isTimeStamp,
  isJobID,
  jobsPath,
  logsPath,
  reportsPath,
  ruleIDs,
  serveError
} = require('./util');
const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const answer = {
  diagnoses: require('./diagnoses/index').answer,
  issues: require('./issues/index').answer,
  manage: require('./manage/index').answer,
  reannotate: require('./reannotate/index').answer,
  reannotateForm: require('./reannotateForm/index').answer,
  reportIssue: require('./reportIssue/index').answer,
  reportIssues: require('./reportIssues/index').answer,
  reportsPruneForm: require('./reportsPruneForm/index').answer,
  reportsRewindForm: require('./reportsRewindForm/index').answer,
  retestRec: require('./retestRec/index').answer,
  retestRecForm: require('./retestRecForm/index').answer,
  rules: require('./rules/index').answer,
  targets: require('./targets/index').answer,
  testOrder: require('./testOrder/index').answer,
  testOrderForm: require('./testOrderForm/index').answer,
  testRec: require('./testRec/index').answer,
  testRecForm: require('./testRecForm/index').answer
};

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';
const queuePath = path.join(jobsPath, 'queue');
const claimedPath = path.join(jobsPath, 'claimed');
const failedPath = path.join(jobsPath, 'failed');
const testaroAgent = process.env.TESTARO_AGENT;
const testaroAgentPW = process.env.TESTARO_AGENT_PW;

// FUNCTIONS

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
      // Report the error.
      await serveError(
        {message: `ERROR: Invalid GET request (${pathname}${search})`}, response, true
      );
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
        await serveError({message: 'Invalid retest recommendation'}, response, true);
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
        await serveError({message: 'Invalid test recommendation'}, response, true);
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
        await serveError({message: 'Invalid test order'}, response, true);
      }
    }
    // Otherwise, if it is a reannotation order:
    else if (pageName === 'reannotate.html') {
      const {authCode} = postData;
      // Serve headers for a response.
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-location', `${pathname}${search}`);
      // Get the answer data.
      const answerData = await require(path.join(__dirname, 'reannotate', 'index'))
      .answer(authCode);
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
    // Otherwise, if it is a request from a Testaro agent:
    else if (pageName === 'api') {
      const [agentID, service] = pageArgs.split('/');
      // If the agent is authorized:
      if (agentID === testaroAgent && postData.agentPW === testaroAgentPW) {
        // If the service is job assignment:
        if (service === 'job') {
          let clean = true;
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
              // Reclassify the job as failed.
              await fs.rename(
                path.join(claimedPath, jobName), path.join(failedPath, jobName)
              );
              clean = false;
              // Stop checking claimed jobs.
              break;
            }
          }
          // If no aborted-job error was found for the agent:
          if (clean) {
            const queuedJobNames = jobNames.queue;
            // If any jobs are queued:
            if (queuedJobNames.length) {
              const oldestJobName = queuedJobNames[0];
              // Get the first one.
              const firstJob = await getObject(path.join(queuePath, oldestJobName));
              // Add the agent ID to the job.
              firstJob.sources.agent = agentID;
              console.log(
                `Job ${firstJob.id} (${firstJob.target.what}) is being sent to the agent.`
              );
              // Assign the job to the agent.
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8'
              });
              console.log(`XXX firstJob:\n${JSON.stringify(firstJob, null, 2)}`);
              response.end(JSON.stringify(firstJob));
              const messageEnd
              = `and job ${firstJob.id} (${firstJob.target.what}) was assigned to the agent`;
              console.log(`${messageStart}${messageEnd}`);
              // Move the job from the queue to the claimed-jobs directory.
              await fs.rename(
                path.join(queuePath, oldestJobName), path.join(claimedPath, oldestJobName)
              );
            }
            // Otherwise, i.e. if no jobs are queued:
            else {
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8'
              });
              // Send a no-jobs response to the agent.
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
          const [timeStamp, jobID] = id?.split('-') ?? ['', ''];
          // If the request is valid:
          if (id && isTimeStamp(timeStamp) && isJobID(jobID) && what && url) {
            // Acknowledge receipt.
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({status: 'ok'}));
            console.log(`Testaro report ${id} was received from Testaro agent ${agentID}`);
            const [timeStamp, jobID] = id.split('-');
            // Save the report.
            await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
            // Create a log for the report.
            const log = {
              what,
              url
            };
            // Save the log.
            await fs.writeFile(getLogPath(timeStamp, jobID), getJSON(log));
            // Annotate the report and mark it as annotated in the log.
            await annotateReport(ruleIDs, timeStamp, jobID);
            console.log(`Testaro report ${id} was annotated, saved, and logged`);
            // Delete the job.
            await fs.unlink(path.join(claimedPath, `${id}.json`));
            console.log(`Completed job ${id} deleted`);
          }
          // Otherwise, i.e. if the request is invalid:
          else {
            await serveError({message: 'ERROR: Report invalid'}, response, false);
          }
        }
        // Otherwise, if the service is not valid:
        else {
          await serveError(
            {message: 'ERROR: Invalid service request from Testaro agent'}, response, false
          );
        }
      }
      // Otherwise, i.e. if the agent is not authorized:
      else {
        await serveError({message: 'ERROR: Invalid Testaro agent'}, response, false);
      }
    }
    // Otherwise, i.e. if it is any other POST request:
    else {
      // Report its invalidity.
      await serveError({message: 'ERROR: Invalid POST request'}, response, true);
    }
  }
  // Otherwise, i.e. if it is neither a GET nor a POST request:
  else {
    // Report its invalidity.
    await serveError({message: 'ERROR: Invalid request method'}, response, true);
  }
};

// SERVER

const serve = async (protocolModule, options) => {
  // Create any missing directories.
  for (const path of [queuePath, claimedPath, failedPath, logsPath, reportsPath]) {
    await fs.mkdir(path, {recursive: true});
  }
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
