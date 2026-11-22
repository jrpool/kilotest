/*
  index.ts
  Dispatches requests of the web interface: the home page and the *.html pages on
  GET and HEAD, and *.html form submissions on POST.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {isSiteID} from '../registry.ts';
import {rejectTestRequests} from '../testRequests.ts';
import {isPathAllowed} from '../routeAuth.ts';
import {
  getAbuseError, recordPageMetric, serveError, setHeaders
} from '../requestKit.ts';
import {
  isAllowedTarget,
  isReportID,
  isURL,
  isValidAuthCode,
  recordMetric
} from '../util.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
import querystring from 'node:querystring';
import {handleComment as handleTutorialWebComment} from './tutorialWeb/index.ts';
import {answer as tutorialWeb} from './tutorialWeb/index.ts';
import {answer as accessibility} from './accessibility/index.ts';
import {answer as demoChatgpt} from './demo-chatgpt/index.ts';
import {answer as home} from './home/index.ts';
import {answer as privacy} from './privacy/index.ts';
import {answer as terms} from './terms/index.ts';
import {answer as tutorialAI, handleComment as handleTutorialAIComment} from './tutorialAI/index.ts';
import {answer as aboutExemplars} from './aboutExemplars/index.ts';
import {answer as ai0BalanceForm} from './ai0BalanceForm/index.ts';
import {answer as deleteNotesForm} from './deleteNotesForm/index.ts';
import {answer as enqueue} from './enqueue/index.ts';
import {answer as enqueueForm} from './enqueueForm/index.ts';
import {answer as expungeReportsForm} from './expungeReportsForm/index.ts';
import {answer as hideReportForm} from './hideReportForm/index.ts';
import {answer as listDiagnosesPage} from './listDiagnoses/index.ts';
import {answer as listIssuesPage} from './listIssues/index.ts';
import {answer as listPagesPage} from './listPages/index.ts';
import {answer as listPreventedEngines} from './listPreventedEngines/index.ts';
import {answer as listPreventingPages} from './listPreventingPages/index.ts';
import {answer as listSitesPage} from './listSites/index.ts';
import {answer as listRuleMatches, getCanonicalTail as getRuleMatchesTail} from './listRuleMatches/index.ts';
import {answer as listRules} from './listRules/index.ts';
import {answer as listTopIssues} from './listTopIssues/index.ts';
import {answer as listViolatorsPage} from './listViolators/index.ts';
import {answer as manage} from './manage/index.ts';
import {answer as metrics} from './metrics/index.ts';
import {answer as pruneReportsForm} from './pruneReportsForm/index.ts';
import {answer as reannotate} from './reannotate/index.ts';
import {answer as reannotateForm} from './reannotateForm/index.ts';
import {answer as renewWCAG} from './renewWCAG/index.ts';
import {answer as reregisterForm} from './reregisterForm/index.ts';
import {answer as renewWCAGForm} from './renewWCAGForm/index.ts';
import {answer as requestRetestPage} from './requestRetest/index.ts';
import {answer as requestRetestForm} from './requestRetestForm/index.ts';
import {answer as requestNewTestPage} from './requestNewTest/index.ts';
import {answer as requestNewTestForm} from './requestNewTestForm/index.ts';
import {answer as rewindReportsForm} from './rewindReportsForm/index.ts';
import {answer as showHiddenReportsForm} from './showHiddenReportsForm/index.ts';
import {answer as unhideReportForm} from './unhideReportForm/index.ts';
/* c8 ignore stop */

// TYPES

// The data returned by a page-answering handler.
type AnswerData = {
  status: string;
  message?: string;
  answerPage?: string;
  // A cookie an answer() handler wants set on the response. Generic, not metrics-specific:
  // handlers return data and never touch the response object directly, so this is how one
  // asks the dispatcher, which owns the response, to set a cookie on its behalf.
  setCookie?: {name: string; value: string; maxAgeSeconds: number};
};
// A page-answering handler, whose parameters vary by topic.
type PageHandler = (...args: any[]) => Promise<AnswerData>;

// CONSTANTS

// The page-answering handlers, by topic.
const answer: {
  aboutExemplars: PageHandler;
  accessibility: PageHandler;
  ai0BalanceForm: PageHandler;
  deleteNotesForm: PageHandler;
  'demo-chatgpt': PageHandler;
  enqueue: PageHandler;
  enqueueForm: PageHandler;
  expungeReportsForm: PageHandler;
  hideReportForm: PageHandler;
  listDiagnoses: PageHandler;
  listIssues: PageHandler;
  listPages: PageHandler;
  listPreventedEngines: PageHandler;
  listPreventingPages: PageHandler;
  listSites: PageHandler;
  listRuleMatches: PageHandler;
  listRules: PageHandler;
  listTopIssues: PageHandler;
  listViolators: PageHandler;
  manage: PageHandler;
  metrics: PageHandler;
  pruneReportsForm: PageHandler;
  reregisterForm: PageHandler;
  privacy: PageHandler;
  tutorialWeb: PageHandler;
  tutorialAI: PageHandler;
  reannotate: PageHandler;
  reannotateForm: PageHandler;
  renewWCAG: PageHandler;
  renewWCAGForm: PageHandler;
  requestRetest: PageHandler;
  requestRetestForm: PageHandler;
  requestNewTest: PageHandler;
  requestNewTestForm: PageHandler;
  rewindReportsForm: PageHandler;
  showHiddenReportsForm: PageHandler;
  terms: PageHandler;
  unhideReportForm: PageHandler;
  [key: string]: PageHandler | undefined;
} = {
  aboutExemplars,
  accessibility,
  ai0BalanceForm,
  deleteNotesForm,
  'demo-chatgpt': demoChatgpt,
  enqueue,
  enqueueForm,
  expungeReportsForm,
  hideReportForm,
  listDiagnoses: listDiagnosesPage,
  listIssues: listIssuesPage,
  listPages: listPagesPage,
  listPreventedEngines,
  listPreventingPages,
  listSites: listSitesPage,
  listRuleMatches,
  listRules,
  listTopIssues,
  listViolators: listViolatorsPage,
  manage,
  metrics,
  pruneReportsForm,
  reregisterForm,
  privacy,
  tutorialWeb,
  tutorialAI,
  reannotate,
  reannotateForm,
  renewWCAG,
  renewWCAGForm,
  requestRetest: requestRetestPage,
  requestRetestForm,
  requestNewTest: requestNewTestPage,
  requestNewTestForm,
  rewindReportsForm,
  showHiddenReportsForm,
  terms,
  unhideReportForm
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
  'reregisterForm',
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
  'reregisterForm',
  'hideReportForm',
  'showHiddenReportsForm',
  'unhideReportForm',
  'ai0BalanceForm',
  'deleteNotesForm',
  'metrics'
]);
// The self-submitting manager pages that must never be served on a direct GET, so that
// the names of hidden reports are never disclosed without an authorization code:
// unhideReportForm is served only by showHiddenReportsForm, as the response to a
// successfully submitted code.
const noDirectGetPages = new Set(['unhideReportForm']);
// Old page names that search engines and other crawlers still request; redirecting them
// lets crawlers re-index instead of repeating dead requests indefinitely. Each entry
// maps an old name to its current name, its rename date, and the date after which the
// redirect is to be retired.
export const renamedPagePrefixes: Record<string, {to: string; renameDate: string; retireAfter: string}> = {
  diagnoses: {to: 'listDiagnoses', renameDate: '2026-08-31', retireAfter: '2027-04-01'},
  reportIssue: {to: 'listViolators', renameDate: '2026-08-31', retireAfter: '2027-04-01'},
  reportIssues: {to: 'listIssues', renameDate: '2026-08-31', retireAfter: '2027-04-01'},
  rules: {to: 'listRules', renameDate: '2026-08-31', retireAfter: '2027-04-01'},
  targets: {to: 'listSites', renameDate: '2026-08-31', retireAfter: '2027-04-01'},
  listReports: {to: 'listSites', renameDate: '2026-10-09', retireAfter: '2027-04-09'},
  requestTest: {to: 'requestNewTest', renameDate: '2026-09-28', retireAfter: '2027-03-28'},
  requestTestForm: {to: 'requestNewTestForm', renameDate: '2026-09-28', retireAfter: '2027-03-28'},
  tutorial: {to: 'tutorialWeb', renameDate: '2026-11-06', retireAfter: '2027-05-06'}
};
// Pages whose report-identifying path tails once used two segments (a timeStamp
// segment and a jobID segment) where they now use one reportID segment (see
// docs/decisions/009-report-id.md). Each value gives the index of the first
// legacy segment within the path tail, the total segment count of the legacy
// tail, and the date after which the redirect is to be retired. Only listIssues
// is listed: links to it in the two-segment form were distributed to tested-site
// owners, so it is the page with demonstrated legacy-link traffic.
export const legacyReportTails: Record<string, {idIndex: number; segmentCount: number; retireAfter: string}> = {
  listIssues: {idIndex: 0, segmentCount: 2, retireAfter: '2027-02-10'}
};

// FUNCTIONS

// Returns the single-reportID path that a legacy two-segment report path tail (one
// identifying a report with separate timeStamp and jobID segments) canonicalizes to
// for a page under its current name, or null if the page has no legacy form or the
// tail lacks its shape.
const getLegacyReportURL = (topic: string, pathTail: string): string | null => {
  const legacy = legacyReportTails[topic];
  if (!legacy) {
    return null;
  }
  const segments = pathTail.split('/');
  const reportID = `${segments[legacy.idIndex]}-${segments[legacy.idIndex + 1]}`;
  if (segments.length !== legacy.segmentCount || !isReportID(reportID)) {
    return null;
  }
  const newTail = [
    ...segments.slice(0, legacy.idIndex), reportID, ...segments.slice(legacy.idIndex + 2)
  ].join('/');
  return `/${topic}.html/${newTail}`;
};
// Applies a cookie an answer() handler asked to have set on the response.
const applySetCookie = (answerData: AnswerData, response: ServerResponse): void => {
  if (answerData.setCookie) {
    const {name, value, maxAgeSeconds} = answerData.setCookie;
    response.setHeader(
      'Set-Cookie', `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict`
    );
  }
};
// Handles a GET request for the home page or an HTML page.
export const handleWebGet = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const requestURL = new URL(request.url as string, 'https://localhost:3000');
  const {pathname, search} = requestURL;
  const pageName = pathname.split('/')[1]!;
  const pathTail = pathname.split('/').slice(2).join('/');
  // If it is for the home page:
  if (['/', '/index.html'].includes(pathname)) {
    // If the URL has a query string, redirect the request permanently to the
    // queryless URL (see the same redirect for .html pages below).
    if (search) {
      response.writeHead(301, {Location: pathname});
      response.end();
    }
    // Otherwise, i.e. if the URL has no query string:
    else {
      await recordPageMetric(request, 'pageViews', 'index');
      // Get the home page.
      const {answerPage} = await home();
      // Serve it.
      setHeaders(response, 'text/html', '/index.html', 'medium');
      response.end(answerPage);
    }
  }
  // Otherwise, i.e. if it is for another HTML page:
  else {
    const topic = pageName.slice(0, -5);
    // Compute the path in the current request signature: the current name if the
    // page name is a pre-rename one, and the single-reportID tail if the tail
    // identifies a report with the legacy two-segment form (a timeStamp segment
    // and a jobID segment).
    // A request for the list of tested pages without a site, which listed all tested pages before sites existed, is a request for the list of tested sites.
    const canonicalTopic = topic === 'listPages' && !pathTail ? 'listSites' : renamedPagePrefixes[topic]?.to ?? topic;
    // The minimum support of the rule-match page, which its form submits in the query string, belongs in the path.
    const canonicalTail = canonicalTopic === 'listRuleMatches' ? getRuleMatchesTail(pathTail, search) : pathTail;
    const canonicalPath = getLegacyReportURL(canonicalTopic, canonicalTail) ??
      `/${canonicalTopic}.html${canonicalTail ? `/${canonicalTail}` : ''}`;
    // If the request signature contains any obsolete element (a pre-rename page
    // name, a legacy two-segment report tail, or a query string, which no GET
    // page handler reads, since the search argument passed to answer() is
    // consumed only for POST requests, where it is reconstructed from the
    // request body), convert all of them at once by redirecting the request
    // permanently to the canonical path with no query string. A request with a
    // query otherwise returns a byte-identical duplicate of the queryless page,
    // which search engines report as a duplicate without a user-selected
    // canonical (e.g. the pathID queries still requested on listDiagnoses URLs).
    if (canonicalPath !== pathname || search) {
      response.writeHead(301, {Location: canonicalPath});
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
      setHeaders(response, 'text/html', pathname, 'ultra');
      // Get the answer data. The method is passed so that a self-submitting manager
      // page's handler can tell a form-display GET from its own submission POST.
      const answerData = await answer[topic](pathTail, search, request.method);
      // If they are valid:
      if (answerData.status === 'ok') {
        if (managerPages.has(topic)) {
          await recordMetric('managerActivity', topic, 'ok');
        }
        else {
          await recordPageMetric(request, 'pageViews', topic);
        }
        applySetCookie(answerData, response);
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
};
// Handles a HEAD request for the home page, the only path supporting HEAD, since
// UptimeRobot's uptime check is the only known HEAD caller and it targets only
// that path (see "Health monitoring" in docs/SERVICE.md). Its response must
// match what GET / would send, minus the body, so that a monitor reading headers
// alone sees the real page state.
export const handleWebHead = (response: ServerResponse): void => {
  setHeaders(response, 'text/html', '/index.html', 'medium');
  response.end();
};
// Handles a POST request for an HTML page.
export const handleWebPost = async (
  request: IncomingMessage, response: ServerResponse, postData: unknown
): Promise<void> => {
  const requestURL = new URL(request.url as string, 'https://localhost:3000');
  const {pathname} = requestURL;
  const pageName = pathname.split('/')[1]!;
  const pathTail = pathname.split('/').slice(2).join('/');
  // If the request is a test request:
  if (pageName === 'requestNewTest.html') {
    const {siteID = '', siteName = '', pageName, url, why} = postData as {siteID?: string; siteName?: string; pageName?: string; url: string; why?: string};
    // If the request is valid, identifying an existing site or naming a new one:
    if ((siteID ? isSiteID(siteID) : siteName) && pageName && isURL(url) && why && await isAllowedTarget(url)) {
      // Serve headers for a response.
      setHeaders(response, 'text/html', pathname, 'ultra');
      // Get the answer data.
      const answerData = await answer.requestNewTest(siteID, siteName, pageName, url, why);
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
      await serveError({message: 'ERROR: Invalid test request'}, response, true);
    }
  }
  // Otherwise, if it is a retest request:
  else if (pageName === 'requestRetest.html') {
    const {why} = postData as {why?: string};
    // If the request is valid:
    if (isReportID(pathTail) && why) {
      // Serve response headers.
      setHeaders(response, 'text/html', pathname, 'ultra');
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
    const [url, requestID] = target.split('\t') as [string, string];
    // If the request is valid:
    if (isURL(url) && isValidAuthCode(authCode)) {
      // Set the non-location headers for a response.
      setHeaders(response, 'text/html', null, 'ultra');
      // If the request is an approval:
      if (requestID) {
        // Process the approval.
        const answerData = await answer.enqueue(url, requestID);
        // If it succeeded:
        if (answerData.status === 'ok') {
          await recordMetric('managerActivity', 'requestAction.html', 'ok');
          // Set a location header for a response.
          response.setHeader('content-location', pathname);
          // Serve the test-order page.
          response.end(answerData.answerPage);
        }
        // Otherwise, i.e. if it failed:
        else {
          await recordMetric('managerActivity', 'requestAction.html', 'error');
          // Report why.
          await serveError({message: answerData.message}, response, true);
        }
      }
      // Otherwise, i.e. if it is a rejection:
      else {
        await recordMetric('managerActivity', 'requestAction.html', 'ok');
        // Reject the test requests for the URL.
        await rejectTestRequests(url);
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
    setHeaders(response, 'text/html', pathname, 'ultra');
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
    setHeaders(response, 'text/html', pathname, 'low');
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
    setHeaders(response, 'text/html', pathname, 'ultra');
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
    const answerData = await answer[topic]!(pathTail, search, request.method);
    // If they are valid:
    if (answerData.status === 'ok') {
      await recordMetric('managerActivity', topic, 'ok');
      applySetCookie(answerData, response);
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
  // Otherwise, if it is a tutorial comment:
  else if (pageName === 'tutorialWebComment.html') {
    const {content} = postData as {content?: unknown};
    setHeaders(response, 'application/json', null, 'low');
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
    setHeaders(response, 'application/json', null, 'low');
    const answerData = await handleTutorialAIComment(content);
    if (answerData.status === 'ok') {
      response.end(JSON.stringify({status: 'ok'}));
    }
    else {
      response.statusCode = 400;
      response.end(JSON.stringify({status: 'error', message: answerData.message}));
    }
  }
};
