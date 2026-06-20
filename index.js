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
  getLogs,
  getObject,
  getPOSTData,
  getReport,
  getRecs,
  getReportPath,
  isHidden,
  isTimeStamp,
  isJobID,
  isURL,
  jobsPath,
  logsPath,
  reportsPath,
  ruleIDs
} = require('./util');
const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const {sendAlert} = require('./alerts');
const answer = {
  ai0BalanceForm: require('./ai0BalanceForm/index').answer,
  diagnoses: require('./diagnoses/index').answer,
  issues: require('./issues/index').answer,
  manage: require('./manage/index').answer,
  reannotate: require('./reannotate/index').answer,
  reannotateForm: require('./reannotateForm/index').answer,
  recActionForm: require('./recActionForm/index').answer,
  reportIssue: require('./reportIssue/index').answer,
  reportIssues: require('./reportIssues/index').answer,
  reportsExpungeForm: require('./reportsExpungeForm/index').answer,
  reportHideForm: require('./reportHideForm/index').answer,
  reportsPruneForm: require('./reportsPruneForm/index').answer,
  reportsRewindForm: require('./reportsRewindForm/index').answer,
  reportUnhideForm: require('./reportUnhideForm/index').answer,
  retestRec: require('./retestRec/index').answer,
  retestRecForm: require('./retestRecForm/index').answer,
  rules: require('./rules/index').answer,
  targets: require('./targets/index').answer,
  testOrder: require('./testOrder/index').answer,
  testRec: require('./testRec/index').answer,
  testRecForm: require('./testRecForm/index').answer,
  tutorial: require('./tutorial/index').answer,
  wcagRenew: require('./wcagRenew/index').answer,
  wcagRenewForm: require('./wcagRenewForm/index').answer
};

// CONSTANTS

const protocol = process.env.PROTOCOL || 'http';
const queuePath = path.join(jobsPath, 'queue');
const claimedPath = path.join(jobsPath, 'claimed');
const failedPath = path.join(jobsPath, 'failed');
const testaroAgent = process.env.TESTARO_AGENT;
const testaroAgentPW = process.env.TESTARO_AGENT_PW;
const researchAgent = process.env.RESEARCH_AGENT;
const researchAgentPW = process.env.RESEARCH_AGENT_PW;
// Values that may require alerts.
const balancePath = path.join(__dirname, 'aiService0Balance.json');
const WAVE_THRESHOLD = Number(process.env.WAVE_BALANCE_THRESHOLD);
const AI_SERVICE0_THRESHOLD = Number(process.env.AI_SERVICE0_BALANCE_THRESHOLD);
const AI_MODEL0_INPUT_PRICE = Number(process.env.AI_MODEL0_INPUT_PRICE);
const AI_MODEL0_OUTPUT_PRICE = Number(process.env.AI_MODEL0_OUTPUT_PRICE);

// FUNCTIONS

// Serves or sends an error message.
const serveError = async (error, response, isHumanUser = true) => {
  console.log(error.message || 'ERROR');
  if (! response.writableEnded) {
    response.statusCode = 400;
    // If the request is from a human user:
    if (isHumanUser) {
      // Serve an HTML page containing the message property of the error.
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-location', '/error.html');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3000');
      const errorTemplate = await fs.readFile('error.html', 'utf8');
      const errorPage = errorTemplate.replace(/__error__/, error.message || 'ERROR');
      response.end(errorPage);
    }
    // Otherwise, i.e. if it is from an agent:
    else {
      // Send a JSON response containing the entire error.
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({error}));
    }
  }
  else {
    console.log('Cannot send error response because the response has ended.');
  }
};
// Checks a report for balances nearing exhaustion.
const checkBalancesForAlerts = async report => {
  // If the variables to be monitored for alerts are defined:
  if (WAVE_THRESHOLD && AI_SERVICE0_THRESHOLD && AI_MODEL0_INPUT_PRICE && AI_MODEL0_OUTPUT_PRICE) {
    // WAVE.
    const waveAct = report.acts.find(act => act.type === 'test' && act.which === 'wave');
    const creditsRemaining = waveAct?.data?.creditsRemaining;
    // If a WAVE balance nearing exhaustion is reported:
    if (typeof creditsRemaining === 'number' && creditsRemaining < WAVE_THRESHOLD) {
      // Alert a manager.
      await sendAlert(
        'Kilotest: WAVE balance low',
        `Only ${creditsRemaining} WAVE credits remain (3 used per job)`
      );
    }
    const testaroAct = report.acts.find(act => act.type === 'test' && act.which === 'testaro');
    // Get the AI model token usage for the testaro allCaps test.
    const usage = testaroAct?.data?.ruleData?.allCaps?.aiModelUsage;
    let balanceJSON = null;
    try {
      // Get the recorded AI service 0 balance.
      balanceJSON = await fs.readFile(balancePath, 'utf8');
    }
    catch (error) {
      console.error('ERROR: AI service 0 balance file missing');
    }
    // If the variables required for an AI service 0 balance alert are defined:
    if (usage && AI_MODEL0_INPUT_PRICE && AI_MODEL0_OUTPUT_PRICE && balanceJSON) {
      const inputCost = AI_MODEL0_INPUT_PRICE * usage.inputTokens;
      const outputCost = AI_MODEL0_OUTPUT_PRICE * usage.outputTokens;
      const cost = inputCost + outputCost;
      // If any cost was incurred:
      if (cost > 0) {
        // Warn about this.
        console.log(
          'This job has made the production AI service 0 balance record wrong. Update it.'
        );
      }
      try {
        const balanceData = JSON.parse(balanceJSON);
        // Get an estimate of the balance after this job.
        const newBalance = balanceData.balance - cost;
        if (typeof newBalance === 'number') {
          // Update the recorded balance.
          await fs.writeFile(balancePath, getJSON({balance: newBalance}));
          // If it is nearing exhaustion:
          if (newBalance < AI_SERVICE0_THRESHOLD) {
            // Alert a manager.
            await sendAlert(
              'Kilotest: AI service 0 balance low',
              `Balance of AI service 0 account (https://console.anthropic.com) only about $${newBalance.toFixed(2)} (about $0.01 used per job)`
            );
          }
        }
        else {
          console.log('ERROR: AI service 0 balance is not a number');
        }
      }
      catch (error) {
        console.log(`ERROR managing AI service 0 balance: ${error.message}`);
      }
    }
  }
};
// Minifies a URL.
const minifyURL = url => url.replace(/www\.|\/$/g, '');
// Returns whether a report on a page is available.
const isReportAvailable = async (what, url) => {
  const logs = await getLogs();
  const whats = logs.map(log => log.what);
  const urls = logs.map(log => log.url);
  const miniURLs = urls.map(url => minifyURL(url));
  const miniURL = minifyURL(url);
  return whats.includes(what) || miniURLs.includes(miniURL);
};
// Handles a request.
const requestHandler = async (request, response) => {
  // Sets response headers.
  const setHeaders = (contentType, location, volatility = 'high') => {
    response.setHeader('content-type', `${contentType}; charset=utf-8`);
    if (location) {
      response.setHeader('content-location', location);
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    const lives = {
      ultra: [3, 30],
      high: [300, 3000],
      medium: [1000, 10000],
      low: [5000, 50000]
    };
    response.setHeader(
      'Cache-Control',
      `public, max-age=${lives[volatility][0]}, stale-while-revalidate=${lives[volatility][1]}`
    );
  };
  const {method, url} = request;
  const requestURL = new URL(url, 'https://localhost:3000');
  const {pathname, search} = requestURL;
  const pageName = pathname.split('/')[1];
  const pathTail = pathname.split('/').slice(2).join('/');
  // If the request is an OPTIONS request:
  if (method === 'OPTIONS') {
    // Serve response headers, including one allowing requests from other applications.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.statusCode = 204;
    response.end();
  }
  // Otherwise, if the request is a GET request:
  else if (method === 'GET') {
    // If it is for the home page:
    if (['/', '/index.html'].includes(pathname)) {
      // Get the home page.
      const homePage = await fs.readFile('index.html', 'utf8');
      // Serve it.
      setHeaders('text/html', '/index.html', 'medium');
      response.end(homePage);
    }
    // Otherwise, if it is for the crawler specification:
    else if (pageName === 'robots.txt') {
      const robots = await fs.readFile('robots.txt', 'utf8');
      // Serve it.
      setHeaders('text/plain', '/robots.txt', 'low');
      response.end(robots);
    }
    // Otherwise, if it is for the OpenAPI specification:
    else if (pageName === 'openapi.yaml') {
      const openapi = await fs.readFile('openapi.yaml', 'utf8');
      // Serve it.
      setHeaders('text/yaml', '/openapi.yaml', 'medium');
      response.end(openapi);
    }
    // Otherwise, if it is for the OpenAPI specification where it is not:
    else if (['openapi.json', 'swagger.yaml', 'swagger.json', 'api-docs'].includes(pageName)) {
      // Redirect the client permanently to where the specification is.
      response.writeHead(301, {Location: '/openapi.yaml'});
      response.end();
    }
    // Otherwise, if it is for the large-language-model summary guide:
    else if (pageName === 'llms.txt') {
      const llms = await fs.readFile('llms.txt', 'utf8');
      // Serve it.
      setHeaders('text/plain', '/llms.txt', 'medium');
      response.end(llms);
    }
    // Otherwise, if it is for the large-language-model detailed guide:
    else if (pageName === 'llms-full.txt') {
      const llmsfull = await fs.readFile('llms-full.txt', 'utf8');
      // Serve it.
      setHeaders('text/plain', '/llms-full.txt', 'medium');
      response.end(llmsfull);
    }
    // Otherwise, if it is for a full report download:
    else if (pageName === 'fullReport.json') {
      const [timeStamp, jobID] = pathTail.split('/');
      // If the request is syntactically valid:
      if (isTimeStamp(timeStamp) && isJobID(jobID)) {
        const reportHidden = await isHidden(timeStamp, jobID);
        // If the report exists and is hidden:
        if (reportHidden === true) {
          console.log(`ERROR: Hidden report ${timeStamp}-${jobID} requested`);
          // Report this.
          await serveError(
            {message: `ERROR: requested report ${timeStamp}-${jobID} not available`},
            response,
            true
          );
        }
        // Otherwise, if any other error occurred:
        else if (typeof reportHidden === 'string') {
          // Report it.
          await serveError({message: reportHidden}, response, true);
        }
        // Otherwise, i.e. if the report log is valid and not hidden:
        else {
          // Get the report.
          const report = await getReport(timeStamp, jobID);
          // If it exists and is valid:
          if (typeof report === 'object') {
            // Serve response headers for a JSON download.
            setHeaders('application/json', null, 'low');
            response.setHeader(
              'content-disposition', `attachment; filename="${timeStamp}-${jobID}.json"`,
            );
            // Download the report.
            response.end(getJSON(report));
          }
          // Otherwise, i.e. if an error occurred:
          else {
            // Report it.
            await serveError({message: report}, response, true);
          }
        }
      }
      // Otherwise, i.e. if the request is syntactically invalid:
      else {
        // Report the error.
        await serveError({message: 'ERROR: Invalid report request'}, response, true);
      }
    }
    // Otherwise, if it is for an HTML page other than the home page:
    else if (pageName.endsWith('.html')) {
      const topic = pageName.slice(0, -5);
      // If the page can be generated:
      if (answer[topic]) {
        setHeaders('text/html', `${pathname}${search}`, 'medium');
        // Get the answer data.
        const answerData = await answer[topic](pathTail, search);
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
        await serveError({message: 'ERROR: Invalid request'}, response, true);
      }
    }
    // Otherwise, if it is for an API service:
    else if (pageName === 'api') {
      const [service,  ... specs] = pathTail.split('/');
      // If the service is provision of facts about the available reports:
      if (service === 'targets') {
        // Get the response (potentially error) data.
        const responseData = await require(path.join(__dirname, 'targets', 'api')).response(specs);
        // Send them.
        setHeaders('application/json', null, 'ultra');
        response.end(JSON.stringify(responseData));
      }
      // Otherwise, if the service is provision of issue statistics for a report:
      else if (service === 'reportIssues') {
        // Get the report identifiers from the path.
        const [timeStamp, jobID] = specs;
        const reportSpecsBad = await isHidden(timeStamp, jobID);
        // If the report is nonexistent or hidden:
        if (reportSpecsBad) {
          // Report this.
          await serveError(
            {message: reportSpecsBad === true ? 'Report nonexistent or hidden' : reportSpecsBad},
            response,
            false
          );
        }
        // Otherwise, i.e. if the report is available:
        else {
          // Get the response (potentially error) data.
          const responseData = await require(path.join(__dirname, 'reportIssues', 'api'))
          .response(specs);
          // Send them.
          setHeaders('application/json', null, 'high');
          response.end(JSON.stringify(responseData));
        }
      }
      // Otherwise, i.e. if the service is invalid:
      else {
        // Report this.
        await serveError({message: 'ERROR: Invalid service request'}, response, false);
      }
    }
    // Otherwise, if it is for a tutorial image:
    else if (pathname.startsWith('/tutorial/images/')) {
      const imgFile = pathname.slice('/tutorial/images/'.length);
      const imgPath = path.join(__dirname, 'tutorial', 'images', imgFile);
      try {
        const img = await fs.readFile(imgPath);
        const ext = path.extname(imgFile).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        setHeaders(mimeTypes[ext] || 'application/octet-stream', null, 'low');
        response.end(img);
      }
      catch (_) {
        await serveError({message: 'ERROR: Image not found'}, response, true);
      }
    }
    // Otherwise, if it is for the application icon:
    else if (pathname.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile(path.join(__dirname, 'favicon.ico'));
      // Serve it.
      setHeaders('image/x-icon', null, 'low');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the stylesheet:
    else if (pathname === '/style.css') {
      try {
        // Serve it.
        const styleSheet = await fs.readFile('style.css', 'utf8');
        setHeaders('text/css', null, 'low');
        response.end(styleSheet);
      }
      catch (error) {
        await serveError({message: error.message}, response, true);
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
      const [timeStamp, jobID] = pathTail.split('/');
      // If the request is valid:
      if (isTimeStamp(timeStamp) && isJobID(jobID) && why) {
        // Serve response headers.
        setHeaders('text/html', `${pathname}${search}`, 'ultra');
        // Get the answer data.
        const answerData = await require(path.join(__dirname, 'retestRec', 'index'))
        .answer(pathTail, why);
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
        await serveError({message: 'ERROR: Invalid retest recommendation'}, response, true);
      }
    }
    // Otherwise, if it is a test recommendation:
    else if (pageName === 'testRec.html') {
      const {what, url, why} = postData;
      // If the request is valid:
      if (what && url.startsWith('https://') && why) {
        // If a report on the page is already available:
        if (await isReportAvailable(what, url)) {
          // Report the error.
          await serveError({message: 'ERROR: Page has already been tested'}, response, true);
        }
        // Otherwise, i.e. if no report on the page is available:
        else {
          // Serve headers for a response.
          setHeaders('text/html', `${pathname}${search}`, 'ultra');
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
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        await serveError({message: 'ERROR: Invalid test recommendation'}, response, true);
      }
    }
    // Otherwise, if it is an action on a test or retest recommendation:
    else if (pageName === 'recAction.html') {
      const {target, authCode} = postData;
      const [url, what] = target.split('\t');
      // If the request is valid:
      if (url.startsWith('https://') && authCode === process.env.AUTH_CODE) {
        // Set the non-location headers for a response.
        setHeaders('text/html', null, 'ultra');
        // If the request is an approval:
        if (what) {
          // Set a location header for a response.
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
        // Otherwise, i.e. if it is a rejection:
        else {
          // Get the recommendations.
          const recs = await getRecs();
          // Delete the rejected URL.
          delete recs[url];
          // Save the revised recommendations.
          await fs.writeFile(path.join(__dirname, 'jobs', 'recs.json'), getJSON(recs));
          // Set a location header for a response.
          response.setHeader('content-location', '/recActionForm.html');
          // Get the answer data.
          const answerData = await require(path.join(__dirname, 'recActionForm', 'index')).answer();
          // Serve the test-order form.
          response.end(answerData.answerPage);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report the error.
        await serveError({message: 'ERROR: Invalid test order'}, response, true);
      }
    }
    // Otherwise, if it is a reannotation order:
    else if (pageName === 'reannotate.html') {
      const {authCode} = postData;
      // Set headers for a response.
      setHeaders('text/html', `${pathname}${search}`, 'ultra');
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
    // Otherwise, if it is a WCAG map renewal:
    else if (pageName === 'wcagRenew.html') {
      const {authCode} = postData;
      // Set headers for a response.
      setHeaders('text/html', `${pathname}${search}`, 'low');
      // Get the answer data.
      const answerData = await require(path.join(__dirname, 'wcagRenew', 'index'))
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
    // Otherwise, if it is a request from an agent:
    else if (pageName === 'api') {
      // Get the segments of the path after api.
      const segments = pathTail.split('/');
      // If the first segment is the ID of the Testaro agent and the agent is authenticated:
      if (segments[0] === testaroAgent && postData.agentPW === testaroAgentPW) {
        const agentID = segments[0];
        // Get the requested service from the path.
        const service = segments[1];
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
            // Check the monetary balances and send alerts if nearing exhaustion.
            await checkBalancesForAlerts(report);
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
      // Otherwise, if the first segment is the test recommendation service:
      else if (segments[0] === 'testRecForm') {
        const {what, url, why} = postData;
        // If the payload is a valid test recommendation:
        if (what && isURL(url) && why) {
          // If a report on the page is already available:
          if (await isReportAvailable(what, url)) {
            // Report this.
            await serveError({message: 'ERROR: A report on the page is already available'}, response, false);
          }
          // Otherwise, i.e. if no report on the page is available:
          else {
            // Process the recommendation and get the response data.
            const responseData = await require(path.join(__dirname, 'testRecForm', 'api'))
            .response(what, url, why);
            // Send them.
            setHeaders('application/json', null, 'ultra');
            response.end(JSON.stringify(responseData));
          }
        }
        // Otherwise, i.e. if it is not a valid test recommendation:
        else {
          // Report this.
          await serveError({message: 'ERROR: Invalid test recommendation'}, response, false);
        }
      }
      // Otherwise, i.e. if the request is invalid:
      else {
        // Report this.
        await serveError(
          {message: 'ERROR: Invalid API request'}, response, false
        );
      }
    }
    // Otherwise, if it is a tutorial comment:
    else if (pageName === 'tutorialComment.html') {
      const {content} = postData;
      setHeaders('application/json', null, 'low');
      const answerData = await require(path.join(__dirname, 'tutorial', 'index')).saveComment(content);
      if (answerData.status === 'ok') {
        response.end(JSON.stringify({status: 'ok'}));
      }
      else {
        response.statusCode = 400;
        response.end(JSON.stringify({status: 'error', message: answerData.error}));
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

// EXECUTION

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
