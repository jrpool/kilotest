/*
  index.ts
  Manages Kilotest.
*/

// IMPORTS

import dotenv from 'dotenv';
import {
  errorMessage,
  getJSON,
  getPOSTData,
  getReport,
  isReportError,
  hiddenReportsPath,
  isReportID,
  reportsPath,
  unusableReportsPath
} from './util.ts';
import {handleMCP} from './mcp.ts';
import {
  claimedPath, failedPath, handleWorkerRequest, queuePath
} from './worker/index.ts';
import {
  getAbuseError, getRequestIP, recordPageMetric, serveError, setHeaders
} from './requestKit.ts';
import {isPathAllowed, mcpPath, routes} from './routeAuth.ts';
import fs from 'node:fs/promises';
import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {handleWebGet, handleWebHead, handleWebPost} from './web/index.ts';
import {handleApiRequest} from './api/index.ts';

// ENVIRONMENT

dotenv.config({quiet: true});

// CONSTANTS

// Paths that the application is authorized to handle are composed in routeAuth.ts
// from per-interface lists; they are re-exported here for existing consumers.
export {isPathAllowed, routes};
// The shared error helpers are defined in requestKit.ts and re-exported here
// for existing consumers.
export {serveError, getAbuseError};
// The page-rename and legacy-tail tables are defined in web/index.ts and
// re-exported here for existing consumers.
export {renamedPagePrefixes, legacyReportTails} from './web/index.ts';

// FUNCTIONS

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
// Handles a request.
const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
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
      await handleWebGet(request, response);
    }
    // Otherwise, if it is for the crawler specification:
    else if (pageName === 'robots.txt') {
      const robots = await fs.readFile('robots.txt', 'utf8');
      // Serve it.
      setHeaders(response, 'text/plain', '/robots.txt', 'low');
      response.end(robots);
    }
    // Otherwise, if it is for the OpenAPI specification:
    else if (pageName === 'openapi.yaml') {
      const openapi = await fs.readFile('openapi.yaml', 'utf8');
      // Serve it.
      setHeaders(response, 'text/yaml', '/openapi.yaml', 'medium');
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
      setHeaders(response, 'text/plain', '/llms.txt', 'medium');
      response.end(llms);
    }
    // Otherwise, if it is for the large-language-model detailed guide:
    else if (pageName === 'llms-full.txt') {
      const llmsfull = await fs.readFile('llms-full.txt', 'utf8');
      // Serve it.
      setHeaders(response, 'text/plain', '/llms-full.txt', 'medium');
      response.end(llmsfull);
    }
    // Otherwise, if it is for the summary of capabilities:
    else if (pageName === 'capability.md') {
      const capabilityDoc = await fs.readFile('capability.md', 'utf8');
      // Serve it.
      setHeaders(response, 'text/markdown', '/capability.md', 'medium');
      response.end(capabilityDoc);
    }
    // Otherwise, if it is for the XML sitemap:
    else if (pageName === 'sitemap.xml') {
      const sitemap = await fs.readFile('sitemap.xml', 'utf8');
      // Serve it.
      setHeaders(response, 'application/xml', '/sitemap.xml', 'medium');
      response.end(sitemap);
    }
    // Otherwise, if it is for the PNG version of the logo, served for registries that
    // require a raster icon format:
    else if (pageName === 'logo.png') {
      const logo = await fs.readFile('logo.png');
      // Serve it.
      setHeaders(response, 'image/png', '/logo.png', 'low');
      response.end(logo);
    }
    // Otherwise, if it is for a full report download:
    else if (pageName === 'fullReport.json') {
      // If the request is syntactically valid:
      if (isReportID(pathTail)) {
        // Get it.
        const report = await getReport(pathTail);
        // If this failed:
        if (isReportError(report)) {
          // This is not necessarily abuse: the link may have been generated (e.g. by
          // listIssues.html) before the report was pruned or rewound, or the identifier
          // may have been scraped from the API documentation's examples, none of which
          // is the requester's fault. So tell the requester only that the request was
          // invalid, without accusing them. No manager alert is sent: a missing report
          // is a routine miss, and a report that exists but is unreadable or unusable
          // has already been quarantined and alerted on by getReport.
          console.error(
            `Full report ${pathTail} requested but unavailable (${report.error})`
          );
          await serveError({message: 'ERROR: Invalid request'}, response, true);
        }
        // Otherwise, i.e. if it succeeded:
        else {
          // Serve response headers for a JSON download.
          setHeaders(response, 'application/json', null, 'low');
          response.setHeader(
            'content-disposition', `attachment; filename="${pathTail}.json"`,
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
    // Otherwise, if it is for an exemplar page, a static file in the root-level
    // exemplars directory (see docs/decisions/013-exemplar-pages.md):
    else if (pageName === 'exemplars') {
      const segments = pathTail.split('/');
      // If the tail is a relative path to an .html file:
      if (pathTail.endsWith('.html') && !segments.includes('..') && !segments.includes('.')) {
        // If the URL has a query string, redirect the request permanently to the
        // queryless URL (see the same redirect for .html pages below).
        if (search) {
          response.writeHead(301, {Location: pathname});
          response.end();
        }
        // Otherwise, i.e. if the URL has no query string:
        else {
          // Get the exemplar page.
          const exemplar = await fs.readFile(path.join('exemplars', pathTail), 'utf8')
          .catch(() => null);
          // If it exists:
          if (exemplar !== null) {
            await recordPageMetric(request, 'pageViews', `exemplars/${pathTail}`);
            // Serve it.
            setHeaders(response, 'text/html', `/exemplars/${pathTail}`, 'low');
            response.end(exemplar);
          }
          // Otherwise, i.e. if it does not exist:
          else {
            // Report the error as suspected abuse.
            await serveError(getAbuseError(request, 'Request for nonexistent page'), response, true);
          }
        }
      }
      // Otherwise, i.e. if the tail is not a relative path to an .html file:
      else {
        // Report the error as suspected abuse.
        await serveError(getAbuseError(request, 'ERROR: Invalid exemplar request'), response, true);
      }
    }
    // Otherwise, if it is for an HTML page other than the home page:
    else if (pageName.endsWith('.html')) {
      await handleWebGet(request, response);
    }
    // Otherwise, if it is for an API service:
    else if (pageName === 'api') {
      await handleApiRequest(request, response, pathTail, null);
    }
    // Otherwise, if it is for a well-known resource:
    else if (pathname.startsWith('/.well-known/')) {
      const knownFile = pathname.slice('/.well-known/'.length);
      const knownPath = path.join(import.meta.dirname, 'well-known', knownFile);
      try {
        const known = await fs.readFile(knownPath);
        setHeaders(response, 'text/plain', null, 'low');
        response.end(known);
      }
      catch {
        await serveError({message: 'ERROR: Well-known resource not found'}, response, true);
      }
    }
    // Otherwise, if it is for a media file (e.g. a demonstration video):
    else if (pathname.startsWith('/media/')) {
      const mediaFile = pathname.slice('/media/'.length);
      const mediaPath = path.join(import.meta.dirname, 'media', mediaFile);
      try {
        const media = await fs.readFile(mediaPath);
        const ext = path.extname(mediaFile).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.m4v': 'video/mp4'
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        setHeaders(response, mimeType, null, 'low');
        response.end(media);
      }
      catch {
        await serveError({message: 'ERROR: Media file not found'}, response, true);
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
        setHeaders(response, mimeType, null, 'low');
        response.end(img);
      }
      catch {
        await serveError({message: 'ERROR: Image not found'}, response, true);
      }
    }
    // Otherwise, if it is for the application icon:
    else if (pathname.includes('favicon.')) {
      // Get the site icon (logo.svg; the raster copy is served separately at /logo.png).
      const icon = await fs.readFile(path.join(import.meta.dirname, 'logo.svg'));
      // Serve it.
      setHeaders(response, 'image/svg+xml', null, 'low');
      response.write(icon, 'binary');
      response.end('');
    }
    // Otherwise, if it is for the stylesheet:
    else if (pathname === '/style.css') {
      try {
        // Serve it.
        const styleSheet = await fs.readFile('style.css', 'utf8');
        setHeaders(response, 'text/css', null, 'low');
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
      handleWebHead(response);
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
      // Otherwise, if it is a web-page submission:
      else if (pageName.endsWith('.html')) {
        await handleWebPost(request, response, postData);
      }
      // Otherwise, if it is a request from a Testaro worker:
      else if (pageName === 'worker') {
        await handleWorkerRequest(request, response, pathTail, postData);
      }
      // Otherwise, if it is a request from an API consumer:
      else if (pageName === 'api') {
        await handleApiRequest(request, response, pathTail, postData);
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
  for (const path of [
    queuePath(), claimedPath(), failedPath(), hiddenReportsPath(), reportsPath(), unusableReportsPath()
  ]) {
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
  // Fail fast on missing required environment variables. THIS_KILOTEST_HOST is read raw
  // by getThisHost and interpolated into URLs in every response; KEY and CERT are
  // required only for HTTPS. Other env vars have documented defaults or designed
  // degradation (see env.example and docs/SERVICE.md) and are deliberately not required.
  const requiredEnvVars = ['THIS_KILOTEST_HOST'];
  const startProtocol = process.env.PROTOCOL || 'http';
  if (startProtocol === 'https') {
    requiredEnvVars.push('KEY', 'CERT');
  }
  const missingEnvVars = requiredEnvVars.filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    throw new Error(`Missing required environment variable(s): ${missingEnvVars.join(', ')}`);
  }
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
    starter().catch(error => {
      console.log(errorMessage(error));
      process.exitCode = 1;
    });
  }
};

// EXECUTION

runIfMain(import.meta.main, true);
