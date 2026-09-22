/*
  index.ts
  Manages Kilotest.
*/

// IMPORTS

import dotenv from 'dotenv';
import {
  annotateReportObject,
  createLock,
  deleteTestRequests,
  errorMessage,
  getExclusionCookieValue,
  getJobNames,
  getJSON,
  getObject,
  getPOSTData,
  getReport,
  isAllowedRedirectTarget,
  isAllowedReport,
  isAllowedTarget,
  isReportError,
  getReportPath,
  hiddenReportsPath,
  isReportAvailable,
  isTimeStamp,
  isJobID,
  isURL,
  isUsableReport,
  isValidAuthCode,
  jobsPath,
  metricsExclusionCookieName,
  recordMetric,
  reportsPath
} from './util.ts';
import {sendAlert} from './alerts.ts';
import {checkBalancesForAlerts} from './balances.ts';
import type {Report} from 'testaro';
import {handleMCP, mcpPath} from './mcp.ts';
import fs from 'node:fs/promises';
import {handleComment as handleTutorialWebComment} from './web/tutorialWeb/index.ts';
import {answer as tutorialWeb} from './web/tutorialWeb/index.ts';
import {answer as tutorialAI, handleComment as handleTutorialAIComment} from './web/tutorialAI/index.ts';
import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import https from 'node:https';
import path from 'node:path';
import querystring from 'node:querystring';
import {answer as ai0BalanceForm} from './web/ai0BalanceForm/index.ts';
import {answer as deleteNotesForm} from './web/deleteNotesForm/index.ts';
import {answer as enqueue} from './web/enqueue/index.ts';
import {answer as enqueueForm} from './web/enqueueForm/index.ts';
import {answer as expungeReportsForm} from './web/expungeReportsForm/index.ts';
import {answer as hideReportForm} from './web/hideReportForm/index.ts';
import {answer as listDiagnosesPage} from './web/listDiagnoses/index.ts';
import {answer as listIssuesPage} from './web/listIssues/index.ts';
import {answer as listReportsPage} from './web/listReports/index.ts';
import {answer as listRules} from './web/listRules/index.ts';
import {answer as listTopIssues} from './web/listTopIssues/index.ts';
import {answer as listViolatorsPage} from './web/listViolators/index.ts';
import {answer as manage} from './web/manage/index.ts';
import {answer as metrics} from './web/metrics/index.ts';
import {answer as pruneReportsForm} from './web/pruneReportsForm/index.ts';
import {answer as reannotate} from './web/reannotate/index.ts';
import {answer as reannotateForm} from './web/reannotateForm/index.ts';
import {answer as renewWCAG} from './web/renewWCAG/index.ts';
import {answer as renewWCAGForm} from './web/renewWCAGForm/index.ts';
import {answer as requestRetestPage} from './web/requestRetest/index.ts';
import {answer as requestRetestForm} from './web/requestRetestForm/index.ts';
import {answer as requestTestPage} from './web/requestTest/index.ts';
import {answer as requestTestForm} from './web/requestTestForm/index.ts';
import {answer as rewindReportsForm} from './web/rewindReportsForm/index.ts';
import {answer as showHiddenReportsForm} from './web/showHiddenReportsForm/index.ts';
import {answer as unhideReportForm} from './web/unhideReportForm/index.ts';
import {response as getReportAPI} from './api/getReport.ts';
import {response as listDiagnosesAPI} from './api/listDiagnoses.ts';
import {response as listIssuesAPI} from './api/listIssues.ts';
import {response as listReportsAPI} from './api/listReports.ts';
import {response as listViolatorsAPI} from './api/listViolators.ts';
import {response as requestFeatureAPI} from './api/requestFeature.ts';
import {response as requestRetestAPI} from './api/requestRetest.ts';
import {response as requestTestAPI} from './api/requestTest.ts';

// ENVIRONMENT

dotenv.config({quiet: true});

// CONSTANTS

// The data returned by a page-answering handler.
type AnswerData = {
  status: string;
  message?: string;
  answerPage?: string;
  // A cookie an answer() handler wants set on the response. Generic, not metrics-specific:
  // handlers return data and never touch the response object directly, so this is how one
  // asks index.ts, which owns the response, to set a cookie on its behalf.
  setCookie?: {name: string; value: string; maxAgeSeconds: number};
};
// A page-answering handler, whose parameters vary by topic.
type PageHandler = (...args: any[]) => Promise<AnswerData>;

const answer: {
  ai0BalanceForm: PageHandler;
  deleteNotesForm: PageHandler;
  enqueue: PageHandler;
  enqueueForm: PageHandler;
  expungeReportsForm: PageHandler;
  hideReportForm: PageHandler;
  listDiagnoses: PageHandler;
  listIssues: PageHandler;
  listReports: PageHandler;
  listRules: PageHandler;
  listTopIssues: PageHandler;
  listViolators: PageHandler;
  manage: PageHandler;
  metrics: PageHandler;
  pruneReportsForm: PageHandler;
  tutorialWeb: PageHandler;
  tutorialAI: PageHandler;
  reannotate: PageHandler;
  reannotateForm: PageHandler;
  renewWCAG: PageHandler;
  renewWCAGForm: PageHandler;
  requestRetest: PageHandler;
  requestRetestForm: PageHandler;
  requestTest: PageHandler;
  requestTestForm: PageHandler;
  rewindReportsForm: PageHandler;
  showHiddenReportsForm: PageHandler;
  unhideReportForm: PageHandler;
  [key: string]: PageHandler | undefined;
} = {
  ai0BalanceForm,
  deleteNotesForm,
  enqueue,
  enqueueForm,
  expungeReportsForm,
  hideReportForm,
  listDiagnoses: listDiagnosesPage,
  listIssues: listIssuesPage,
  listReports: listReportsPage,
  listRules,
  listTopIssues,
  listViolators: listViolatorsPage,
  manage,
  metrics,
  pruneReportsForm,
  tutorialWeb,
  tutorialAI,
  reannotate,
  reannotateForm,
  renewWCAG,
  renewWCAGForm,
  requestRetest: requestRetestPage,
  requestRetestForm,
  requestTest: requestTestPage,
  requestTestForm,
  rewindReportsForm,
  showHiddenReportsForm,
  unhideReportForm
};
// Response functions of the API services.
type ApiResponder = (args: string[]) => Promise<unknown>;
const apiRespond: {
  getReport: ApiResponder;
  listDiagnoses: ApiResponder;
  listIssues: ApiResponder;
  listReports: ApiResponder;
  listViolators: ApiResponder;
  requestFeature: ApiResponder;
  requestRetest: ApiResponder;
  requestTest: ApiResponder;
} = {
  getReport: getReportAPI,
  listDiagnoses: listDiagnosesAPI,
  listIssues: listIssuesAPI,
  listReports: listReportsAPI,
  listViolators: listViolatorsAPI,
  requestFeature: requestFeatureAPI,
  requestRetest: requestRetestAPI,
  requestTest: requestTestAPI
};

// CONSTANTS

// Paths that the application is authorized to handle, by method, as glob-style patterns where * matches any sequence of characters.
export const routes = {
  GET: [
    '*.html*',
    '/',
    '/api-docs',
    '/api/*',
    '/capability.md',
    '/favicon.*',
    '/fullReport.json/*',
    '/index.html',
    '/llms-full.txt',
    '/llms.txt',
    '/mcp',
    '/openapi.json',
    '/openapi.yaml',
    '/qai',
    '/qai/comments',
    '/robots.txt',
    '/sitemap.xml',
    '/style.css',
    '/swagger.json',
    '/swagger.yaml',
    '/tutorialWeb/images/*',
    '/tutorialAI/images/*'
  ],
  POST: [
    '/api/*',
    '/mcp',
    '/ai0BalanceForm.html',
    '/deleteNotesForm.html',
    '/expungeReportsForm.html',
    '/hideReportForm.html',
    '/metrics.html',
    '/pruneReportsForm.html',
    '/rewindReportsForm.html',
    '/showHiddenReportsForm.html',
    '/tutorialAIComment.html',
    '/reannotate.html',
    '/requestAction.html',
    '/renewWCAG.html',
    '/requestRetest.html/*',
    '/requestTest.html',
    '/tutorialWebComment.html',
    '/unhideReportForm.html',
    '/worker/job',
    '/worker/report'
  ]
};
// The set of page topics (answer{} keys) that are manager-only pages, linked from
// manage.html. Their views and submissions are recorded under the managerActivity
// metrics category instead of pageViews, since they are the maintainer operating
// Kilotest rather than the usage the observability plan's questions are about.
const managerPages = new Set([
  'enqueueForm',
  'reannotateForm',
  'pruneReportsForm',
  'rewindReportsForm',
  'expungeReportsForm',
  'hideReportForm',
  'showHiddenReportsForm',
  'unhideReportForm',
  'ai0BalanceForm',
  'renewWCAGForm',
  'deleteNotesForm',
  'metrics'
]);
// The set of manager pages (a subset of managerPages) whose single answer() function both
// displays a form on GET and processes that form's own submission on POST, as opposed to
// enqueueForm/reannotateForm, whose submissions post to a separate action page. This
// governs POST dispatch for all of these pages, and GET dispatch for all except
// unhideReportForm (see noDirectGetPages below).
const selfSubmittingManagerPages = new Set([
  'pruneReportsForm',
  'rewindReportsForm',
  'expungeReportsForm',
  'hideReportForm',
  'showHiddenReportsForm',
  'unhideReportForm',
  'ai0BalanceForm',
  'deleteNotesForm',
  'metrics'
]);
// The subset of selfSubmittingManagerPages that must never be served on a direct GET
// request, only as the response to another page's successful submission (here,
// unhideReportForm is served only by showHiddenReportsForm, once a valid authorization code
// has been submitted), so that the names of hidden reports are never disclosed without one.
const noDirectGetPages = new Set(['unhideReportForm']);
// Old page names, from before a 2026-08-31 rename (see GitHub issue #3), that search
// engines and other crawlers are still requesting. Redirecting them lets crawlers update
// their own indexes, rather than leaving them to repeat the same dead request indefinitely.
// TEMPORARY: retire this redirect after 2027-04-01 once crawlers have re-indexed.
const renamedPagePrefixes: Record<string, string> = {
  diagnoses: 'listDiagnoses',
  reportIssue: 'listViolators',
  reportIssues: 'listIssues',
  rules: 'listRules',
  targets: 'listReports'
};
const jobLock = createLock();

// FUNCTIONS

const queuePath = () => path.join(jobsPath(), 'queue');
const claimedPath = () => path.join(jobsPath(), 'claimed');
const failedPath = () => path.join(jobsPath(), 'failed');
// Returns whether a pathname matches a glob-style pattern.
const matchPath = (pattern: string, pathname: string) => {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return regex.test(pathname);
};
// Returns whether a pathname is authorized for a method.
export const isPathAllowed = (method: string, pathname: string): boolean => {
  const patterns = (routes as Record<string, string[]>)[method] || [];
  return patterns.some(pattern => matchPath(pattern, pathname));
};
// Serves or sends an error message.
export const serveError = async (error: Record<string, unknown>, response: ServerResponse, isHumanUser = true, statusCode = 400): Promise<void> => {
  const errorLines = Object.entries(error).map(pair => `${pair[0]}: ${pair[1]}`);
  const errorSummary = errorLines.join('\n') || 'ERROR';
  console.log(errorSummary);
  if (!response.writableEnded) {
    response.statusCode = statusCode;
    // If the request is from a human user:
    if (isHumanUser) {
      // Serve an HTML page containing the message property of the error.
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-location', '/error.html');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3000');
      const errorTemplate = await fs.readFile('error.html', 'utf8');
      const errorMessage = typeof error.message === 'string' ? error.message : 'ERROR';
      const errorPage = errorTemplate.replace(/__error__/, errorMessage);
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
// Returns the IP address a request should be attributed to: the value of its
// x-forwarded-for header (Caddy runs in front of Kilotest, so a real client's address
// arrives this way, not as the socket's own remote address), else the socket's remote
// address, else 'unknown' if neither is available.
export const getRequestIP = (request: IncomingMessage): string | string[] => {
  const forwardedFor = request.headers['x-forwarded-for'];
  const remoteAddress = request.socket.remoteAddress;
  return forwardedFor || remoteAddress || 'unknown';
};
// Creates an error object about a suspicious request.
export const getAbuseError = (request: IncomingMessage, reason: string | undefined) => {
  const {method, url, headers} = request;
  return {
    message: 'Invalid request',
    reason,
    'IP address': getRequestIP(request),
    method,
    URL: url,
    'user agent': headers['user-agent'] || 'none',
    referer: headers.referer || 'none',
    time: new Date().toISOString()
  };
};
// Logs one line for every request, successful or not, once it finishes. Unlike
// getAbuseError (logged only for rejected requests, as a rare, human-read-in-the-moment
// dump), this is a terse, single-line-per-request JSON record, intended to be high-volume
// and machine-parseable, so that any kind of suspicious traffic pattern (not only the
// specific rejection reasons getAbuseError already covers) can be recognized later. It
// deliberately does not consult isMetricsExcluded: that exclusion exists to keep the
// maintainer's own manual testing out of usage counts, but abuse visibility should see
// all traffic, including the maintainer's own, or it recreates the same kind of blind
// spot this logging exists to close.
const logRequestOnFinish = (request: IncomingMessage, response: ServerResponse): void => {
  const {method, headers} = request;
  const ip = getRequestIP(request);
  const userAgent = headers['user-agent'] || 'none';
  const path = new URL(request.url as string, 'https://localhost:3000').pathname;
  const originalEnd = response.end.bind(response);
  // Reassign response.end so that every path through handleRequest logs exactly once,
  // right before the response is actually sent, rather than requiring every dispatch
  // branch to remember to log itself (the same class of gap that left successful
  // requests unlogged in the first place). No query string is logged, so that a
  // parameter such as authCode is never written to a log file.
  response.end = ((...args: Parameters<typeof originalEnd>) => {
    console.log(JSON.stringify({
      type: 'request',
      time: new Date().toISOString(),
      ip,
      method,
      path,
      status: response.statusCode,
      userAgent
    }));
    return originalEnd(...args);
  }) as typeof response.end;
};
// Returns whether a request carries the metrics-exclusion cookie with the value that
// proves it. A request without a valid AUTH_CODE configured can never match, since
// getExclusionCookieValue then hashes an empty string, which no cookie should equal.
const isMetricsExcluded = (request: IncomingMessage): boolean => {
  const header = request.headers.cookie;
  if (!header || !process.env.AUTH_CODE) {
    return false;
  }
  const cookies = header.split(';').map(pair => pair.trim().split('='));
  const cookieValue = cookies.find(([name]) => name === metricsExclusionCookieName)?.[1];
  return cookieValue === getExclusionCookieValue();
};
// Gets the ID and secret from a request's HTTP Basic Authorization header, or null if the header
// is absent or malformed.
const getBasicAuth = (request: IncomingMessage) => {
  const header = request.headers['authorization'] || '';
  const match = header.match(/^Basic\s+(\S+)$/i);
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
  const sepIndex = decoded.indexOf(':');
  if (sepIndex === -1) {
    return null;
  }
  return {id: decoded.slice(0, sepIndex), secret: decoded.slice(sepIndex + 1)};
};
// Returns the credentials of the Testaro workers, by worker ID, from a JSON-object
// environment variable. Each worker ID maps to a secret (used only to authenticate the worker,
// never published) and a name (a non-secret label safe to publish, e.g. in report data and logs).
const getWorkerCredentials = () => {
  try {
    return JSON.parse(process.env.TESTARO_WORKERS || '{}');
  }
  catch (error) {
    console.error(`ERROR: TESTARO_WORKERS is not valid JSON (${errorMessage(error)})`);
    return {};
  }
};
// Gets the published name of a Testaro worker or null if not authenticated.
const getAuthorizedWorkerName = (request: IncomingMessage) => {
  const credentials = getBasicAuth(request);
  if (credentials) {
    const workerCredentials = getWorkerCredentials();
    const worker = workerCredentials[credentials.id];
    if (worker && worker.secret === credentials.secret && worker.name) {
      return worker.name;
    }
  }
  return null;
};
// Processes a job request from a Testaro worker.
const processJobRequest = async (request: IncomingMessage, response: ServerResponse, workerName: string) => jobLock(async () => {
  let clean = true;
  const messageStart = `Testaro worker ${workerName} requested a job, `;
  const jobNames = await getJobNames();
  const claimedJobNames = jobNames.claimed;
  // For each claimed job:
  for (const jobName of claimedJobNames) {
    // A claimed-job file can disappear between the directory listing above and this
    // read, because report submission (which deletes or reclassifies claimed jobs) is
    // not serialized by jobLock. That race is a normal, recoverable condition, so the
    // job is skipped rather than treated as defective; any other failure to read it
    // should never occur and is left to propagate.
    let job: unknown;
    try {
      job = await getObject(path.join(jobsPath(), 'claimed', jobName));
    }
    catch (error: unknown) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    const {id, sources} = job as {id: string, sources: {worker: string}};
    const {worker} = sources;
    // If its assignee is the worker:
    if (worker === workerName) {
      const messageEnd = `but has not completed job ${id}`;
      // Report this.
      await serveError({message: `${messageStart}${messageEnd}`}, response, false);
      // Reclassify the job as failed.
      await fs.rename(
        path.join(claimedPath(), jobName), path.join(failedPath(), jobName)
      );
      clean = false;
      // Stop checking claimed jobs.
      break;
    }
  }
  // If no aborted-job error was found for the worker:
  if (clean) {
    const queuedJobNames = jobNames.queue;
    // If any jobs are queued:
    if (queuedJobNames.length) {
      const oldestJobName = queuedJobNames[0]!;
      // Get the first one.
      const firstJob = await getObject(path.join(queuePath(), oldestJobName)) as {id: string, sources: {worker: string}, target: {what: string, url: string}};
      // If the job's target is no longer allowed, whether because its host now resolves
      // to a disallowed address or, more likely, because the host now redirects to one
      // (both possible if the target host was reconfigured, e.g. by an attacker, after
      // the request was accepted; a fetch-based check is used, rather than the cheaper
      // DNS-only isAllowedTarget, because this runs only when a job is actually queued,
      // which is rare, and a redirect introduced after acceptance is the likelier attack):
      if (!(await isAllowedRedirectTarget(firstJob.target.url))) {
        console.error(`ERROR: Queued job ${firstJob.id} is on a target this deployment does not allow`);
        // Alert a manager, since this indicates an attempted or accidental SSRF
        // rather than an ordinary usability problem with the target.
        await sendAlert(
          'Kilotest: queued job on disallowed target rejected',
          `Job ${firstJob.id} (${firstJob.target.what}) was never assigned to a worker because its target no longer resolves, directly or via a redirect, to an address this deployment allows (e.g. a private, loopback, or link-local address). The job was reclassified as failed.`
        );
        // Reclassify the job as failed, instead of assigning it or leaving it queued.
        await fs.rename(
          path.join(queuePath(), oldestJobName), path.join(failedPath(), oldestJobName)
        );
        // Respond as if no job were queued, rather than revealing anything about the rejected job.
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify({}));
        console.log(`${messageStart}but the queued job was on a disallowed target`);
      }
      // Otherwise, i.e. if the job's target is still allowed:
      else {
        // Add the public worker name to the job, in a property Testaro does not read or alter.
        firstJob.sources.worker = workerName;
        console.log(
          `Job ${firstJob.id} (${firstJob.target.what}) is being sent to the worker.`
        );
        // Assign the job to the worker.
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify(firstJob));
        const messageEnd
        = `and job ${firstJob.id} (${firstJob.target.what}) was assigned to the worker`;
        console.log(`${messageStart}${messageEnd}`);
        // Save the job in the claimed-jobs directory.
        await fs.writeFile(
          path.join(claimedPath(), oldestJobName), getJSON(firstJob)
        );
        // Delete it from the queue.
        await fs.unlink(path.join(queuePath(), oldestJobName));
      }
    }
    // Otherwise, i.e. if no jobs are queued:
    else {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8'
      });
      // Send a no-jobs response to the worker.
      response.end(JSON.stringify({}));
      const messageEnd = 'but no job was in the queue';
      console.log(`${messageStart}${messageEnd}`);
    }
  }
});
// Handles a request.
const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
  // Sets response headers.
  const setHeaders = (contentType: string, location: string | null, volatility: string = 'high') => {
    response.setHeader('content-type', `${contentType}; charset=utf-8`);
    if (location) {
      response.setHeader('content-location', location);
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    const lives: Record<string, number[]> = {
      ultra: [3, 30],
      high: [300, 3000],
      medium: [1000, 10000],
      low: [5000, 50000]
    };
    response.setHeader(
      'Cache-Control',
      `public, max-age=${lives[volatility]![0]}, stale-while-revalidate=${lives[volatility]![1]}`
    );
  };
  const {method, url} = request;
  const requestURL = new URL(url as string, 'https://localhost:3000');
  const {pathname, search} = requestURL;
  const pageName = pathname.split('/')[1]!;
  const pathTail = pathname.split('/').slice(2).join('/');
  // If the request is a smoke-test probe, respond perfunctorily without executing a handler.
  if (request.headers['x-kilotest-smoke']) {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end('{}');
    return;
  }
  // Log this request once it finishes, for general abuse/usage visibility (see GitHub
  // issue #3). Placed after the smoke-test short-circuit above, so CI's own smoke-test
  // traffic is excluded from this log exactly as it is already excluded from metrics.
  logRequestOnFinish(request, response);
  // Records a pageViews or apiOperations metric, unless this request's browser has proven,
  // via a valid authCode submitted earlier on metrics.html, that it belongs to the
  // maintainer testing Kilotest manually rather than to real usage.
  const recordPageMetric = (category: 'pageViews' | 'apiOperations', name: string): Promise<void> =>
    isMetricsExcluded(request) ? Promise.resolve() : recordMetric(category, name);
  // Applies a cookie an answer() handler asked to have set on the response.
  const applySetCookie = (answerData: AnswerData): void => {
    if (answerData.setCookie) {
      const {name, value, maxAgeSeconds} = answerData.setCookie;
      response.setHeader(
        'Set-Cookie', `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict`
      );
    }
  };
  // If the request is a GET request:
  if (method === 'GET') {
    // If the path is not authorized for GET requests:
    if (!isPathAllowed('GET', pathname)) {
      await serveError({message: `ERROR: Invalid GET request (${pathname})`}, response, true);
    }
    // If it is for the model context protocol server:
    else if (pathname === mcpPath) {
      // If the request does not identify itself as capable of an SSE stream: it is a human
      // browsing to the endpoint directly, not an MCP client, so explain what the endpoint is
      // for instead of handing it a bare protocol-level rejection.
      if (!request.headers.accept?.includes('text/event-stream')) {
        await serveError({
          message: 'This endpoint is for AI agents, not for direct browsing. See the <a href="/tutorialAI.html">tutorial on connecting an AI platform to Kilotest</a>.'
        }, response);
      }
      // Otherwise, i.e. if it identifies itself as capable of an SSE stream:
      else {
        // Handle the MCP request.
        await handleMCP(request, response);
      }
    }
    // Otherwise, if it is for the home page:
    else if (['/', '/index.html'].includes(pathname)) {
      await recordPageMetric('pageViews', 'index');
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
    // Otherwise, if it is for the old QAI comments path:
    else if (pathname === '/qai/comments') {
      // Redirect the client permanently to the new tutorial path (comments are now integrated).
      response.writeHead(301, {Location: '/tutorialAI.html'});
      response.end();
    }
    // Otherwise, if it is for the old QAI root path:
    else if (pathname === '/qai') {
      // Redirect the client permanently to the new tutorial path.
      response.writeHead(301, {Location: '/tutorialAI.html'});
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
    // Otherwise, if it is for the summary of capabilities:
    else if (pageName === 'capability.md') {
      const capabilityDoc = await fs.readFile('capability.md', 'utf8');
      // Serve it.
      setHeaders('text/markdown', '/capability.md', 'medium');
      response.end(capabilityDoc);
    }
    // Otherwise, if it is for the XML sitemap:
    else if (pageName === 'sitemap.xml') {
      const sitemap = await fs.readFile('sitemap.xml', 'utf8');
      // Serve it.
      setHeaders('application/xml', '/sitemap.xml', 'medium');
      response.end(sitemap);
    }
    // Otherwise, if it is for a full report download:
    else if (pageName === 'fullReport.json') {
      const [timeStamp, jobID] = pathTail.split('/') as [string, string, ...string[]];
      // If the request is syntactically valid:
      if (isTimeStamp(timeStamp) && isJobID(jobID)) {
        // Get it.
        const report = await getReport(timeStamp, jobID);
        // If this failed:
        if (isReportError(report)) {
          // This is not necessarily abuse: the link may have been generated (e.g. by
          // listIssues.html) before the report was pruned or rewound, or the stored report
          // may have become unreadable or unusable, none of which is the requester's fault.
          // So tell the requester only that the request was invalid, without accusing them,
          // but alert a manager with the real reason, since a syntactically valid report ID
          // should otherwise always be usable.
          console.error(
            `Full report ${timeStamp}-${jobID} requested but unavailable (${report.error})`
          );
          await sendAlert(
            'Kilotest: requested full report unavailable',
            `Full report ${timeStamp}-${jobID} was requested but could not be retrieved: ${report.error}`
          );
          await serveError({message: 'ERROR: Invalid request'}, response, true);
        }
        // Otherwise, i.e. if it succeeded:
        else {
          // Serve response headers for a JSON download.
          setHeaders('application/json', null, 'low');
          response.setHeader(
            'content-disposition', `attachment; filename="${timeStamp}-${jobID}.json"`,
          );
          // Download the report.
          response.end(getJSON(report));
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
      // If it is for a page's old, pre-rename name:
      if (renamedPagePrefixes[topic]) {
        // Redirect the client permanently to the current page name, preserving any
        // further path segments and the query string.
        const newLocation = `/${renamedPagePrefixes[topic]}.html${pathTail ? `/${pathTail}` : ''}${search}`;
        response.writeHead(301, {Location: newLocation});
        response.end();
      }
      // Otherwise, if the page can be generated and is not POST-only (a POST-only path also matches
      // the '*.html*' GET pattern, but its handler expects POST's argument list and
      // performs no GET-appropriate rendering; a self-submitting manager page is POST-allowed
      // too, but its handler serves both methods the same way, so it is not excluded here,
      // except for a page in noDirectGetPages, which stays excluded from GET even though
      // it is self-submitting, since it must be reachable only via another page's POST):
      else if (
        answer[topic] &&
        !noDirectGetPages.has(topic) &&
        (!isPathAllowed('POST', pathname) || selfSubmittingManagerPages.has(topic))
      ) {
        setHeaders('text/html', pathname, 'ultra');
        // Get the answer data. The method is passed so that a self-submitting manager
        // page's handler can tell a form-display GET from its own submission POST.
        const answerData = await answer[topic](pathTail, search, method);
        // If they are valid:
        if (answerData.status === 'ok') {
          if (managerPages.has(topic)) {
            await recordMetric('managerActivity', topic, 'ok');
          }
          else {
            await recordPageMetric('pageViews', topic);
          }
          applySetCookie(answerData);
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          if (managerPages.has(topic)) {
            await recordMetric('managerActivity', topic, 'error');
          }
          // Report the error as suspected abuse.
          await serveError(getAbuseError(request, answerData.message), response, true);
        }
      }
      // Otherwise, i.e. if the answer cannot be generated:
      else {
        // Report the error as suspected abuse.
        await serveError(getAbuseError(request, 'Request for nonexistent page'), response, true);
      }
    }
    // Otherwise, if it is for an API service:
    else if (pageName === 'api') {
      const [service, ...specs] = pathTail.split('/');
      // If the service lists the available reports:
      if (service === 'listReports') {
        // Get the response body.
        const responseBody = await apiRespond.listReports([]);
        await recordPageMetric('apiOperations', 'listReports');
        // Send it.
        setHeaders('application/json', null, 'ultra');
        response.end(JSON.stringify(responseBody));
      }
      // Otherwise, if the service lists the issues in a report:
      else if (service === 'listIssues') {
        // Get the response body.
        const responseBody = await apiRespond.listIssues(specs);
        await recordPageMetric('apiOperations', 'listIssues');
        // Send it.
        setHeaders('application/json', null, 'high');
        response.end(JSON.stringify(responseBody));
      }
      // Otherwise, if the service lists the violators of an issue in a report:
      else if (service === 'listViolators') {
        // Get the response body.
        const responseBody = await apiRespond.listViolators(specs);
        await recordPageMetric('apiOperations', 'listViolators');
        // Send it.
        setHeaders('application/json', null, 'high');
        response.end(JSON.stringify(responseBody));
      }
      // Otherwise, if the service lists the diagnoses of a violation of an issue in a report:
      else if (service === 'listDiagnoses') {
        // Get the response body.
        const responseBody = await apiRespond.listDiagnoses(specs);
        await recordPageMetric('apiOperations', 'listDiagnoses');
        // Send it.
        setHeaders('application/json', null, 'high');
        response.end(JSON.stringify(responseBody));
      }
      // Otherwise, if the service serves a report:
      else if (service === 'getReport') {
        // Get the response body.
        const responseBody = await apiRespond.getReport(specs);
        await recordPageMetric('apiOperations', 'getReport');
        // Send it.
        setHeaders('application/json', null, 'low');
        response.end(JSON.stringify(responseBody));
      }
      // Otherwise, i.e. if the service is invalid:
      else {
        // Report this.
        await serveError({message: 'Invalid service request'}, response, false);
      }
    }
    // Otherwise, if it is for a tutorial image:
    else if (pathname.startsWith('/tutorialWeb/images/') || pathname.startsWith('/tutorialAI/images/')) {
      let imgFile: string;
      let tutorialDir: string;
      if (pathname.startsWith('/tutorialWeb/images/')) {
        imgFile = pathname.slice('/tutorialWeb/images/'.length);
        tutorialDir = 'tutorialWeb';
      }
      else {
        imgFile = pathname.slice('/tutorialAI/images/'.length);
        tutorialDir = 'tutorialAI';
      }
      const imgPath = path.join(import.meta.dirname, 'web', tutorialDir, 'images', imgFile);
      try {
        const img = await fs.readFile(imgPath);
        const ext = path.extname(imgFile).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        setHeaders(mimeType, null, 'low');
        response.end(img);
      }
      catch {
        await serveError({message: 'ERROR: Image not found'}, response, true);
      }
    }
    // Otherwise, if it is for the application icon:
    else if (pathname.includes('favicon.')) {
      // Get the site icon.
      const icon = await fs.readFile(path.join(import.meta.dirname, 'favicon.ico'));
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
        await serveError({message: errorMessage(error)}, response, true);
      }
    }
    // Otherwise, i.e. if it is any other GET request:
    else {
      // Report the error.
      await serveError(
        {message: `ERROR: Invalid GET request (${pathname})`}, response, true
      );
    }
  }
  // Otherwise, if the request is a HEAD request: only the home page supports HEAD, since
  // UptimeRobot's uptime check is the only known HEAD caller and it targets only that path
  // (see "Health monitoring" in docs/SERVICE.md). Its response must match what GET / would
  // send, minus the body, so that a monitor reading headers alone sees the real page state.
  else if (method === 'HEAD') {
    if (['/', '/index.html'].includes(pathname)) {
      setHeaders('text/html', '/index.html', 'medium');
      response.end();
    }
    else {
      await serveError({message: `ERROR: Invalid HEAD request (${pathname})`}, response, true);
    }
  }
  // Otherwise, if the request is a POST request:
  else if (method === 'POST') {
    // If the path is not authorized for POST requests:
    if (!isPathAllowed('POST', pathname)) {
      await serveError({message: 'ERROR: Invalid POST request'}, response, true);
    }
    // If it is for the model context protocol server:
    else if (pageName === 'mcp') {
      await handleMCP(request, response);
    }
    // Otherwise, i.e. if it is not for the MCP server:
    else {
      // Get the data from the request body.
      const postData = await getPOSTData(request);
      // If the body could not be parsed (unknown content-type or malformed JSON):
      if (postData === null) {
        await serveError({message: 'ERROR: Unreadable request body'}, response, true);
      }
      // If the request is a test request:
      else if (pageName === 'requestTest.html') {
        const {description, url, why} = postData as {description?: string; url: string; why?: string};
        // If the request is valid:
        if (description && isURL(url) && why && await isAllowedTarget(url)) {
          // If a report on the page is already available:
          if (await isReportAvailable(description, url)) {
            // Report the error.
            await serveError({message: 'ERROR: Page has already been tested'}, response, true);
          }
          // Otherwise, i.e. if no report on the page is available:
          else {
            // Serve headers for a response.
            setHeaders('text/html', pathname, 'ultra');
            // Get the answer data.
            const answerData = await answer.requestTest(description, url, why);
            // If they are valid:
            if (answerData.status === 'ok') {
              // Serve the answer page.
              response.end(answerData.answerPage);
            }
            // Otherwise, i.e. if they are invalid:
            else {
              // Report the error.
              await serveError({message: answerData.message}, response, true);
            }
          }
        }
        // Otherwise, i.e. if the request is invalid:
        else {
          // Report the error.
          await serveError({message: 'ERROR: Invalid test request'}, response, true);
        }
      }
      // Otherwise, if it is a retest request:
      else if (pageName === 'requestRetest.html') {
        const {why} = postData as {why?: string};
        const [timeStamp, jobID] = pathTail.split('/') as [string, string, ...string[]];
        // If the request is valid:
        if (isTimeStamp(timeStamp) && isJobID(jobID) && why) {
          // Serve response headers.
          setHeaders('text/html', pathname, 'ultra');
          // Get the answer data.
          const answerData = await answer.requestRetest(pathTail, why);
          // If they are valid:
          if (answerData.status === 'ok') {
            // Serve the answer page.
            response.end(answerData.answerPage);
          }
          // Otherwise, i.e. if they are invalid:
          else {
            // Report the error.
            await serveError({message: answerData.message}, response, true);
          }
        }
        // Otherwise, i.e. if the request is invalid:
        else {
          // Report the error.
          await serveError({message: 'ERROR: Invalid retest request'}, response, true);
        }
      }
      // Otherwise, if it is an approval or rejection of a test request:
      else if (pageName === 'requestAction.html') {
        const {target, authCode} = postData as {target: string; authCode?: string};
        const [url, description] = target.split('\t') as [string, string];
        // If the request is valid:
        if (isURL(url) && isValidAuthCode(authCode)) {
          // Set the non-location headers for a response.
          setHeaders('text/html', null, 'ultra');
          // If the request is an approval:
          if (description) {
            // Set a location header for a response.
            response.setHeader('content-location', pathname);
            // Process the approval and get the answer data about the remaining requests.
            const answerData = await answer.enqueue(url, description);
            await recordMetric('managerActivity', 'requestAction.html', 'ok');
            // Serve the test-order page with the remaining recommendations.
            response.end(answerData.answerPage);
          }
          // Otherwise, i.e. if it is a rejection:
          else {
            await recordMetric('managerActivity', 'requestAction.html', 'ok');
            // Delete the test requests for the URL.
            await deleteTestRequests(url);
            // Set a location header for a response.
            response.setHeader('content-location', '/enqueueForm.html');
            // Get the answer data.
            const answerData = await answer.enqueueForm();
            // Serve the test-order form with the remaining recommendations.
            response.end(answerData.answerPage);
          }
        }
        // Otherwise, i.e. if the request is invalid:
        else {
          await recordMetric('managerActivity', 'requestAction.html', 'error');
          // Report the error, deliberately vague so as not to confirm to an attacker
          // which part of the request (the URL, or the authorization code) was wrong.
          await serveError({message: 'Invalid request'}, response, true);
        }
      }
      // Otherwise, if it is a reannotation order:
      else if (pageName === 'reannotate.html') {
        const {authCode} = postData as {authCode?: string};
        // Set headers for a response.
        setHeaders('text/html', pathname, 'ultra');
        // Get the answer data.
        const answerData = await answer.reannotate(authCode);
        // If the answer data are valid:
        if (answerData.status === 'ok') {
          await recordMetric('managerActivity', 'reannotate.html', 'ok');
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          await recordMetric('managerActivity', 'reannotate.html', 'error');
          // Report the error.
          await serveError({message: answerData.message}, response, true);
        }
      }
      // Otherwise, if it is a WCAG map renewal:
      else if (pageName === 'renewWCAG.html') {
        const {authCode} = postData as {authCode?: string};
        // Set headers for a response.
        setHeaders('text/html', pathname, 'low');
        // Get the answer data.
        const answerData = await answer.renewWCAG(authCode);
        // If the answer data are valid:
        if (answerData.status === 'ok') {
          await recordMetric('managerActivity', 'renewWCAG.html', 'ok');
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          await recordMetric('managerActivity', 'renewWCAG.html', 'error');
          // Report the error.
          await serveError({message: answerData.message}, response, true);
        }
      }
      // Otherwise, if it is a self-submitting manager page (one page serves the form on
      // GET and processes its own submission on POST, unlike enqueueForm.html/reannotateForm.html,
      // whose submissions go to a separate action page):
      else if (pageName.endsWith('.html') && selfSubmittingManagerPages.has(pageName.slice(0, -5))) {
        const topic = pageName.slice(0, -5);
        setHeaders('text/html', pathname, 'ultra');
        // Reconstruct a query string from the POST body, so the page's answer() function
        // can read its submitted parameters the same way it reads a GET query string.
        // querystring.stringify (rather than the URLSearchParams object constructor) is
        // required here, because postData, from querystring.parse in getPOSTData, holds
        // repeated form fields (e.g. multiple checked checkboxes sharing a name) as an
        // array; the URLSearchParams constructor would join such an array into a single
        // comma-separated value instead of preserving it as repeated key=value pairs.
        const search = `?${querystring.stringify(postData as Record<string, string | string[]>)}`;
        // Get the answer data. The method is passed so the handler only processes a
        // submission for POST, never for GET, regardless of what its query string contains.
        const answerData = await answer[topic]!(pathTail, search, method);
        // If they are valid:
        if (answerData.status === 'ok') {
          await recordMetric('managerActivity', topic, 'ok');
          applySetCookie(answerData);
          // Serve the answer page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if they are invalid:
        else {
          await recordMetric('managerActivity', topic, 'error');
          // Report the error.
          await serveError({message: answerData.message}, response, true);
        }
      }
      // Otherwise, if it is a request from a Testaro worker:
      else if (pageName === 'worker') {
        // Authenticate the worker and get its public name.
        const workerName = getAuthorizedWorkerName(request);
        // If this succeeded:
        if (workerName) {
          // Get the requested service from the path.
          const service = pathTail;
          // If the service is job assignment:
          if (service === 'job') {
            // Process the job request as a transaction.
            await processJobRequest(request, response, workerName);
          }
          // Otherwise, if it is report acquisition:
          else if (service === 'report') {
            const {report} = postData as {report?: Report};
            const reportObj: Partial<Report> = report ?? {};
            const {id, target} = reportObj;
            const {what: description, url} = (target ?? {}) as Partial<NonNullable<Report['target']>>;
            const [timeStamp, jobID] = (id?.split('-') ?? ['', '']) as [string, string];
            // If the request is syntactically valid:
            if (id && isTimeStamp(timeStamp) && isJobID(jobID) && description && url) {
              // Get the job the report is from. A missing claimed-job file (the job was
              // never claimed, or was already completed) is a normal outcome, handled below
              // as if the job were not assigned to this worker; any other failure to read it
              // should never occur and is left to propagate.
              let claimedJob: unknown = null;
              try {
                claimedJob = await getObject(path.join(claimedPath(), `${id}.json`));
              }
              catch (error: unknown) {
                if (!(error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')) {
                  throw error;
                }
              }
              // If the job was actually assigned to this worker:
              if (typeof claimedJob === 'object' && claimedJob !== null && (claimedJob as {sources?: {worker?: string}}).sources?.worker === workerName) {
                // If the report is on a target this deployment allows (a redirect during
                // navigation, possibly via DNS rebinding, can take a worker to a target that
                // was disallowed even though the originally submitted URL passed that check
                // at submission time):
                if (!(await isAllowedReport(reportObj))) {
                  console.error(`ERROR: Report ${id} from worker ${workerName} is on a disallowed target`);
                  // Alert a manager, since this indicates an attempted or accidental SSRF
                  // rather than an ordinary usability problem with the report.
                  await sendAlert(
                    'Kilotest: report on disallowed target rejected',
                    `Job ${id} from worker ${workerName} resulted in a visit to a target this deployment does not allow (e.g. a private, loopback, or link-local address), possibly via a redirect. The report was discarded and the job was reclassified as failed.`
                  );
                  // Reclassify the job as failed, instead of recording the disallowed report or
                  // leaving the job claimed indefinitely.
                  await fs.rename(
                    path.join(claimedPath(), `${id}.json`), path.join(failedPath(), `${id}.json`)
                  );
                  // Report the error.
                  await serveError({message: `ERROR: Report ${id} is on a disallowed target`}, response, false);
                }
                // Otherwise, if the report is usable by Kilotest (as any report of an assigned job should be):
                else if (isUsableReport(reportObj)) {
                  console.log(`Testaro report ${id} was received from worker ${workerName}`);
                  // Add the public worker name to the report.
                  report!.sources = {...report!.sources, worker: workerName};
                  // Annotate the report before it is ever written, rather than writing it,
                  // reading it back, annotating that copy, and writing it again: the read-back
                  // could fail even though the just-written report is fine.
                  await annotateReportObject(reportObj);
                  // Save the annotated report.
                  await fs.writeFile(getReportPath(timeStamp, jobID), getJSON(report));
                  console.log(`Testaro report ${id} was annotated and saved`);
                  // Check the monetary balances and send alerts if nearing exhaustion.
                  await checkBalancesForAlerts(report!);
                  // Delete the job.
                  await fs.unlink(path.join(claimedPath(), `${id}.json`));
                  console.log(`Completed job ${id} deleted`);
                  // Acknowledge receipt.
                  response.setHeader('content-type', 'application/json; charset=utf-8');
                  response.end(JSON.stringify({status: 'ok'}));
                  console.log(
                    `Testaro report ${id} was received from Testaro worker ${workerName}`
                  );
                }
                // Otherwise, i.e. if the report is not usable by Kilotest:
                else {
                  console.error(`ERROR: Report ${id} from worker ${workerName} is not usable`);
                  // Alert a manager, since an assigned job should never produce an unusable report.
                  await sendAlert(
                    'Kilotest: unusable report received',
                    `Job ${id} from worker ${workerName} produced a report that Kilotest cannot use. The job was reclassified as failed instead of being recorded.`
                  );
                  // Reclassify the job as failed, instead of recording the unusable report or
                  // leaving the job claimed indefinitely.
                  await fs.rename(
                    path.join(claimedPath(), `${id}.json`), path.join(failedPath(), `${id}.json`)
                  );
                  // Report the error.
                  await serveError({message: `ERROR: Report ${id} is not usable`}, response, false);
                }
              }
              // Otherwise, i.e. if the job was not assigned to this worker:
              else {
                await serveError(
                  getAbuseError(
                    request,
                    `Worker ${workerName} submitted a report for job ${id}, which was not currently assigned to it`
                  ),
                  response,
                  false
                );
              }
            }
            // Otherwise, i.e. if the request is syntactically invalid:
            else {
              await serveError({message: 'ERROR: Request invalid'}, response, false);
            }
          }
        }
        // Otherwise, i.e. if it is not authenticated:
        else {
          // Report this.
          await serveError(
            {message: 'ERROR: Unauthorized worker request'}, response, false, 401
          );
        }
      }
      // Otherwise, if it is a request from an API consumer:
      else if (pageName === 'api') {
        // Get the segments of the path after api.
        const segments = pathTail.split('/');
        // If the service is to receive a test request:
        if (segments[0] === 'requestTest') {
          const {description, URL, reason} = postData as {description: string; URL: string; reason: string};
          // Get the response body.
          const responseBody = await apiRespond.requestTest([description, URL, reason]);
          await recordPageMetric('apiOperations', 'requestTest');
          // Send it.
          setHeaders('application/json', null, 'ultra');
          response.end(JSON.stringify(responseBody));
        }
        // Otherwise, if the service is to receive a retest request:
        else if (segments[0] === 'requestRetest') {
          const {reason} = postData as {reason: string};
          // Get the response body.
          const responseBody = await apiRespond.requestRetest(segments.slice(1).concat(reason));
          await recordPageMetric('apiOperations', 'requestRetest');
          // Send it.
          setHeaders('application/json', null, 'ultra');
          response.end(JSON.stringify(responseBody));
        }
        // Otherwise, if the service is to receive a feature request:
        else if (segments[0] === 'requestFeature') {
          const {feature} = postData as {feature: string};
          // Get the response body.
          const responseBody = await apiRespond.requestFeature([feature]);
          await recordPageMetric('apiOperations', 'requestFeature');
          // Send it.
          setHeaders('application/json', null, 'ultra');
          response.end(JSON.stringify(responseBody));
        }
        // Otherwise, i.e. if the service is invalid:
        else {
          await serveError(
            {message: 'ERROR: Invalid service requested'}, response, false
          );
        }
      }
      // Otherwise, if it is a tutorial comment:
      else if (pageName === 'tutorialWebComment.html') {
        const {content} = postData as {content?: unknown};
        setHeaders('application/json', null, 'low');
        const answerData = await handleTutorialWebComment(content);
        if (answerData.status === 'ok') {
          response.end(JSON.stringify({status: 'ok'}));
        }
        else {
          response.statusCode = 400;
          response.end(JSON.stringify({status: 'error', message: answerData.message}));
        }
      }
      // Otherwise, if it is an AI tutorial comment:
      else if (pageName === 'tutorialAIComment.html') {
        const {content} = postData as {content?: unknown};
        setHeaders('application/json', null, 'low');
        const answerData = await handleTutorialAIComment(content);
        if (answerData.status === 'ok') {
          response.end(JSON.stringify({status: 'ok'}));
        }
        else {
          response.statusCode = 400;
          response.end(JSON.stringify({status: 'error', message: answerData.message}));
        }
      }
    }
  }
  // Otherwise, i.e. if it is none of GET, HEAD, or POST:
  else {
    // Report its invalidity. (Caddy handles OPTIONS requests.)
    await serveError({message: 'ERROR: Invalid request method'}, response, true);
  }
};
// Handles a request, converting any error not already handled by handleRequest (i.e. one
// that should never occur, such as a job or report file becoming unreadable or corrupt)
// into a safe response instead of letting it crash the process as an unhandled rejection.
const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    await handleRequest(request, response);
  }
  catch (error: unknown) {
    console.error(`ERROR: Unhandled request error (${errorMessage(error)})`);
    await serveError({message: 'ERROR: Internal server error'}, response, false, 500);
  }
};

// EXPORTS

export {requestHandler};

// SERVER

const serve = async (protocolModule: typeof http | typeof https, options: {key?: string; cert?: string}) => {
  // Create any missing directories.
  for (const path of [queuePath(), claimedPath(), failedPath(), hiddenReportsPath(), reportsPath()]) {
    await fs.mkdir(path, {recursive: true});
  }
  const server = protocolModule === https
    ? https.createServer(options, requestHandler)
    : http.createServer(requestHandler);
  const port = process.env.PORT || '3000';
  const protocol = process.env.PROTOCOL || 'http';
  server.listen(port, () => {
    console.log(`Kilotest server listening at ${protocol}://localhost:${port}.`);
  });
  return server;
};

export {serve};

// Starts the server using the configured protocol and credentials.
export const startServer = async () => {
  const startProtocol = process.env.PROTOCOL || 'http';
  if (startProtocol === 'http') {
    console.log('Starting HTTP server');
    return serve(http, {});
  }
  else if (startProtocol === 'https') {
    console.log('Starting HTTPS server');
    const key = await fs.readFile(process.env.KEY as string, 'utf8');
    const cert = await fs.readFile(process.env.CERT as string, 'utf8');
    return serve(https, {key, cert});
  }
};

// Runs the server if the module was loaded directly (not required by a test). The starter is a parameter so tests can inject a spy, since ESM module exports cannot be monkey-patched.
export const runIfMain = (mainModule: unknown, currentModule: unknown, starter: () => Promise<unknown> = startServer) => {
  if (mainModule === currentModule) {
    starter().catch(error => console.log(errorMessage(error)));
  }
};

// EXECUTION

runIfMain(import.meta.main, true);
