/*
  smokeTest.ts
  Sends requests to all valid GET and POST paths on the deployed server and verifies that Caddy forwards them to Kilotest (i.e., the response is not a bare Caddy 404), then sends a real MCP initialize request to verify end-to-end MCP delivery through the proxy.
*/

// IMPORTS

import https from 'node:https';
import {routes} from './index.ts';
import {mcpPath} from './mcp.ts';

// CONSTANTS

// Concrete paths matching each wildcard pattern in the routes table, for smoke testing.
const concretePaths: Record<string, Record<string, string>> = {
  GET: {
    '*.html*': '/listReports.html',
    '/': '/',
    '/api-docs': '/api-docs',
    '/api/*': '/api/listReports',
    '/capability.md': '/capability.md',
    '/favicon.*': '/favicon.ico',
    '/fullReport.json/*': '/fullReport.json/260101T0000/mix',
    '/index.html': '/index.html',
    '/llms-full.txt': '/llms-full.txt',
    '/llms.txt': '/llms.txt',
    '/mcp': '/mcp',
    '/openapi.json': '/openapi.json',
    '/openapi.yaml': '/openapi.yaml',
    '/qai': '/qai',
    '/qai/comments': '/qai/comments',
    '/robots.txt': '/robots.txt',
    '/sitemap.xml': '/sitemap.xml',
    '/style.css': '/style.css',
    '/swagger.json': '/swagger.json',
    '/swagger.yaml': '/swagger.yaml',
    '/tutorialAI/images/*': '/tutorialAI/images/example.png',
    '/tutorialWeb/images/*': '/tutorialWeb/images/newsletter-form.png'
  },
  POST: {
    '/api/*': '/api/requestFeature',
    '/mcp': '/mcp',
    '/ai0BalanceForm.html': '/ai0BalanceForm.html',
    '/expungeReportsForm.html': '/expungeReportsForm.html',
    '/hideReportForm.html': '/hideReportForm.html',
    '/metrics.html': '/metrics.html',
    '/pruneReportsForm.html': '/pruneReportsForm.html',
    '/rewindReportsForm.html': '/rewindReportsForm.html',
    '/reannotate.html': '/reannotate.html',
    '/requestAction.html': '/requestAction.html',
    '/renewWCAG.html': '/renewWCAG.html',
    '/requestRetest.html/*': '/requestRetest.html/260101T0001/ct',
    '/requestTest.html': '/requestTest.html',
    '/showHiddenReportsForm.html': '/showHiddenReportsForm.html',
    '/tutorialAIComment.html': '/tutorialAIComment.html',
    '/tutorialWebComment.html': '/tutorialWebComment.html',
    '/unhideReportForm.html': '/unhideReportForm.html',
    '/worker/job': '/worker/job',
    '/worker/report': '/worker/report'
  }
};
// Minimal POST bodies for paths that require them.
const postBodies: Record<string, object> = {
  '/api/requestFeature': {feature: 'smoke test'},
  '/mcp': {},
  '/ai0BalanceForm.html': {authCode: 'invalid'},
  '/expungeReportsForm.html': {authCode: 'invalid'},
  '/hideReportForm.html': {authCode: 'invalid'},
  '/metrics.html': {authCode: 'invalid'},
  '/pruneReportsForm.html': {authCode: 'invalid'},
  '/rewindReportsForm.html': {authCode: 'invalid'},
  '/reannotate.html': {authCode: 'invalid'},
  '/requestAction.html': {
    target: 'https://smoketest.example.com\tSmoke Test Page', authCode: 'invalid'
  },
  '/renewWCAG.html': {authCode: 'invalid'},
  '/requestRetest.html/260101T0001/ct': {why: 'smoke test'},
  '/requestTest.html': {description: 'Smoke Test Page', url: 'https://smoketest.example.com', why: 'smoke test'},
  '/showHiddenReportsForm.html': {authCode: 'invalid'},
  '/tutorialAIComment.html': {content: 'smoke test'},
  '/unhideReportForm.html': {authCode: 'invalid'},
  '/tutorialWebComment.html': {content: 'smoke test'},
  '/worker/job': {},
  '/worker/report': {}
};
// The JSON-RPC initialize request sent by the positive MCP probe.
const mcpInitialize = {
  jsonrpc: '2.0',
  method: 'initialize',
  id: 'smoke',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {name: 'kilotest-smoke', version: '1.0'}
  }
};

// FUNCTIONS

// Sends an HTTPS request and returns the status code and body length.
const sendRequest = (method: string, requestPath: string) =>
  new Promise<{statusCode: number | undefined, bodyLength: number}>((resolve, reject) => {
    const body = method === 'POST' ? JSON.stringify(postBodies[requestPath] || {}) : null;
    const headers: Record<string, string | number> = {'x-kilotest-smoke': '1'};
    if (body) {
      headers['content-type'] = 'application/json; charset=utf-8';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const options = {
      method,
      host: process.env.SMOKE_HOST || 'kilotest.com',
      path: requestPath,
      headers
    };
    const req = https.request(options, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const responseBody = chunks.join('');
        resolve({statusCode: response.statusCode, bodyLength: responseBody.length});
      });
    });
    req.on('error', reject);
    req.end(body || '');
  });

// Returns whether a response is a bare Caddy 404 (the failure this test detects).
const isCaddy404 = (result: {statusCode: number | undefined, bodyLength: number}) =>
  result.statusCode === 404 && result.bodyLength === 0;

// Sends a request to the MCP endpoint without the smoke header and returns the status code and body.
const sendMCPRequest = (method: string, accept: string, body: object | null = null) =>
  new Promise<{statusCode: number | undefined, body: string}>((resolve, reject) => {
    const bodyData = body ? JSON.stringify(body) : null;
    const headers: Record<string, string | number> = {accept};
    if (bodyData) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(bodyData);
    }
    const req = https.request({
      method,
      host: process.env.SMOKE_HOST || 'kilotest.com',
      path: mcpPath,
      headers
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        resolve({statusCode: response.statusCode, body: chunks.join('')});
      });
    });
    req.on('error', reject);
    req.end(bodyData || '');
  });

// Returns whether an MCP probe response is a valid initialize result from Kilotest.
const isValidMCPResponse = (result: {statusCode: number | undefined, body: string}) => {
  if (result.statusCode !== 200) {
    return false;
  }
  try {
    const dataLine = result.body.split('\n').find(line => line.startsWith('data: '));
    const message = JSON.parse(dataLine ? dataLine.slice(6) : result.body);
    return message?.result?.serverInfo?.name === 'Kilotest';
  }
  catch {
    return false;
  }
};

// Returns whether a response is a JSON-RPC protocol error, the expected rejection of an invalid MCP request.
const isMCPErrorResponse = (result: {statusCode: number | undefined, body: string}) => {
  if (result.statusCode === undefined || result.statusCode < 400 || result.statusCode >= 500) {
    return false;
  }
  try {
    const message = JSON.parse(result.body);
    return message?.jsonrpc === '2.0' && typeof message?.error?.code === 'number';
  }
  catch {
    return false;
  }
};

// EXECUTION

(async () => {
  let failures = 0;
  for (const method of ['GET', 'POST']) {
    console.log(`\n=== ${method} paths ===`);
    for (const pattern of routes[method as 'GET' | 'POST']) {
      const requestPath = concretePaths[method]![pattern];
      if (!requestPath) {
        console.log(`FAIL: no concrete path defined for pattern ${pattern}`);
        failures++;
        continue;
      }
      try {
        const result = await sendRequest(method, requestPath);
        if (isCaddy404(result)) {
          console.log(`FAIL: ${method} ${requestPath} -> Caddy 404 (path not forwarded)`);
          failures++;
        }
        else {
          console.log(`PASS: ${method} ${requestPath} -> ${result.statusCode} (body ${result.bodyLength} bytes)`);
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`FAIL: ${method} ${requestPath} -> error: ${message}`);
        failures++;
      }
    }
  }
  // Send a real MCP initialize request to verify routing, header forwarding, and SSE delivery.
  console.log('\n=== MCP probes ===');
  try {
    const probe = await sendMCPRequest('POST', 'application/json, text/event-stream', mcpInitialize);
    if (isValidMCPResponse(probe)) {
      console.log(`PASS: POST ${mcpPath} initialize -> ${probe.statusCode} (valid MCP response)`);
    }
    else {
      console.log(`FAIL: POST ${mcpPath} initialize -> ${probe.statusCode} (body: ${probe.body.slice(0, 120)})`);
      failures++;
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL: POST ${mcpPath} initialize -> error: ${message}`);
    failures++;
  }
  // Send a browser-style GET to verify that invalid MCP requests get JSON-RPC errors end-to-end.
  try {
    const probe = await sendMCPRequest('GET', 'text/html');
    if (isMCPErrorResponse(probe)) {
      console.log(`PASS: GET ${mcpPath} browser -> ${probe.statusCode} (JSON-RPC error)`);
    }
    else {
      console.log(`FAIL: GET ${mcpPath} browser -> ${probe.statusCode} (body: ${probe.body.slice(0, 120)})`);
      failures++;
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL: GET ${mcpPath} browser -> error: ${message}`);
    failures++;
  }
  console.log(`\n=== ${failures === 0 ? 'All checks passed' : `${failures} failure(s)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
})();
