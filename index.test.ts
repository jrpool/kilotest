/*
  index.test.ts
  Integration tests for index.js requestHandler, covering GET routes, POST routes,
  error paths, worker authentication, and helper function behavior.
*/

// ENVIRONMENT (the test environment configuration; all modules now read
// process.env at call time, so load order no longer matters.)

import path from 'node:path';
import {fixtureDBDir} from './test/dbFixture.ts';

const testCommentsDir = path.join(import.meta.dirname, 'test/fixtures/comments');
process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TUTORIAL_WEB_COMMENTS_PATH = path.join(testCommentsDir, 'tutorialWeb.json');
process.env.TUTORIAL_AI_COMMENTS_PATH = path.join(testCommentsDir, 'tutorialAI.json');
process.env.FEATURE_REQUESTS_PATH = path.join(testCommentsDir, 'featureRequests.json');
process.env.TESTARO_WORKERS = JSON.stringify({
  worker1: {secret: 'secret1', name: 'Worker One'}
});
// Allow internal targets by default, so tests that submit an ordinary https://example.com/...
// URL do not depend on real DNS/network access to pass the resolution check that
// isAllowedTarget performs. Tests of the check itself (below) override this per test.
process.env.ALLOW_INTERNAL_TARGETS = 'true';
// Blank the alert configuration unconditionally, so this file sends no real alert
// emails (e.g. from the requestTest/requestRetest/tutorial-comment tests below) even
// when run directly (e.g. `npx tsx --test index.test.ts`) rather than via `npm test`,
// which normally guards against this by --require-ing test/setup.ts first. dotenv does
// not override an already-set env var, so setting these here, before index.ts is ever
// imported, prevents a real .env file's alert credentials from ever taking effect.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import * as indexModule from './index.ts';
const {requestHandler, routes, serveError, startServer, runIfMain, isPathAllowed, getAbuseError} = indexModule;

// CONSTANTS

const port = 3997;
const testRequestsPath = path.join(fixtureDBDir, 'jobs', 'testRequests.json');
const metricsPath = path.join(fixtureDBDir, 'metrics.json');

// SETUP AND TEARDOWN

let server: http.Server;

before(async () => {
  server = http.createServer(requestHandler);
  await new Promise<void>(resolve => server.listen(port, () => resolve()));
});

// Restore testRequests.json and clean job directories before each test, so tests do not depend on execution order.
beforeEach(async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(fixtureDBDir, 'jobs', sub);
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
  // Create test comments directory and reset test comment files so tests start clean.
  await fs.mkdir(testCommentsDir, {recursive: true});
  await fs.writeFile(path.join(testCommentsDir, 'tutorialWeb.json'), '[]\n');
  await fs.writeFile(path.join(testCommentsDir, 'tutorialAI.json'), '[]\n');
  await fs.writeFile(path.join(testCommentsDir, 'featureRequests.json'), '[]\n');
});

after(async () => {
  // Close all idle connections, then close the server with a timeout.
  server.closeAllConnections?.();
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, 1000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  // Restore testRequests.json and clean job directories after running.
  await fs.writeFile(testRequestsPath, '{}\n');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(fixtureDBDir, 'jobs', sub);
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
});

// CONSTANTS

const uniqueStamp = Date.now();

// HELPERS

const request = (method: string, requestPath: string, body: any = null, headers: any = {}): Promise<any> => new Promise((resolve, reject) => {
  const options = {method, host: 'localhost', port, path: requestPath, headers: {...headers}};
  let bodyData = '';
  if (body) {
    if (typeof body === 'object') {
      bodyData = JSON.stringify(body);
      options.headers['content-type'] = options.headers['content-type'] || 'application/json';
    }
    else {
      bodyData = body;
    }
    options.headers['content-length'] = Buffer.byteLength(bodyData);
  }
  const req = http.request(options, response => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()});
    });
  });
  req.on('error', reject);
  req.end(bodyData || '');
});

const formRequest = (method: string, requestPath: string, formData: any, headers: any = {}): Promise<any> => new Promise((resolve, reject) => {
  const body = new URLSearchParams(formData).toString();
  const options = {
    method,
    host: 'localhost',
    port,
    path: requestPath,
    headers: {
      ...headers,
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(body)
    }
  };
  const req = http.request(options, response => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()});
    });
  });
  req.on('error', reject);
  req.end(body);
});

const jsonBody = (res: any) => {
  try {
    return JSON.parse(res.body);
  }
  catch {
    return null;
  }
};
// Returns the current count for a metrics category and name, or 0 if the file or the
// entry is absent (the file does not exist until the first metric is recorded).
const getMetricCount = async (category: string, name: string): Promise<number> => {
  let metricsJSON: string;
  try {
    metricsJSON = await fs.readFile(metricsPath, 'utf8');
  }
  catch {
    return 0;
  }
  const metrics = JSON.parse(metricsJSON);
  return metrics[category][name] ?? 0;
};
// Returns the current managerActivity ok/error count for a page name, or 0 if absent.
const getManagerActivityCount = async (name: string, outcome: 'ok' | 'error'): Promise<number> => {
  let metricsJSON: string;
  try {
    metricsJSON = await fs.readFile(metricsPath, 'utf8');
  }
  catch {
    return 0;
  }
  const metrics = JSON.parse(metricsJSON);
  return metrics.managerActivity[name]?.[outcome] ?? 0;
};

// TESTS: routes table

test('routes has GET and POST arrays', () => {
  assert.ok(Array.isArray(routes.GET));
  assert.ok(Array.isArray(routes.POST));
});

// TESTS: smoke-test short-circuit

test('GET with x-kilotest-smoke header returns a perfunctory 200', async () => {
  const res = await request('GET', '/api/listReports', null, {'x-kilotest-smoke': '1'});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{}');
});

test('POST with x-kilotest-smoke header returns a perfunctory 200', async () => {
  const res = await request('POST', '/api/requestFeature', {}, {'x-kilotest-smoke': '1'});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{}');
});

test('GET without x-kilotest-smoke header executes the handler', async () => {
  const res = await request('GET', '/api/listReports');
  assert.equal(res.statusCode, 200);
  assert.notEqual(res.body, '{}');
});

// TESTS: GET routes

test('GET / serves the home page as HTML', async () => {
  const res = await request('GET', '/');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.ok(res.body.includes('<html'));
});

test('GET /index.html serves the home page', async () => {
  const res = await request('GET', '/index.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

// TESTS: HEAD routes

test('HEAD / returns the same status and headers as GET /, with no body', async () => {
  const getRes = await request('GET', '/');
  const headRes = await request('HEAD', '/');
  assert.equal(headRes.statusCode, getRes.statusCode);
  assert.equal(headRes.headers['content-type'], getRes.headers['content-type']);
  assert.equal(headRes.body, '');
});

test('HEAD /index.html returns the same status and headers as GET /, with no body', async () => {
  const getRes = await request('GET', '/');
  const headRes = await request('HEAD', '/index.html');
  assert.equal(headRes.statusCode, getRes.statusCode);
  assert.equal(headRes.headers['content-type'], getRes.headers['content-type']);
  assert.equal(headRes.body, '');
});

test('HEAD /robots.txt returns an invalid HEAD request error, since only the home page supports HEAD', async () => {
  const res = await request('HEAD', '/robots.txt');
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, '');
});

test('GET /robots.txt serves the robots file as text', async () => {
  const res = await request('GET', '/robots.txt');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/plain'));
  assert.ok(res.body.length > 0);
});

test('GET /openapi.yaml serves the OpenAPI spec as YAML', async () => {
  const res = await request('GET', '/openapi.yaml');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/yaml'));
  assert.ok(res.body.includes('openapi'));
});

test('GET /openapi.json redirects to /openapi.yaml', async () => {
  const res = await request('GET', '/openapi.json');
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/openapi.yaml');
});

test('GET /swagger.yaml redirects to /openapi.yaml', async () => {
  const res = await request('GET', '/swagger.yaml');
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/openapi.yaml');
});

test('GET /swagger.json redirects to /openapi.yaml', async () => {
  const res = await request('GET', '/swagger.json');
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/openapi.yaml');
});

test('GET /api-docs redirects to /openapi.yaml', async () => {
  const res = await request('GET', '/api-docs');
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/openapi.yaml');
});

test('GET /llms.txt serves the LLM summary as text', async () => {
  const res = await request('GET', '/llms.txt');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/plain'));
  assert.ok(res.body.length > 0);
});

test('GET /llms-full.txt serves the LLM detailed guide as text', async () => {
  const res = await request('GET', '/llms-full.txt');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/plain'));
  assert.ok(res.body.length > 0);
});

test('GET /capability.md serves the capability manifest as markdown', async () => {
  const res = await request('GET', '/capability.md');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/markdown'));
  assert.ok(res.body.length > 0);
});

test('GET /sitemap.xml serves the sitemap as XML', async () => {
  const res = await request('GET', '/sitemap.xml');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('application/xml'));
  assert.ok(res.body.includes('<urlset') || res.body.includes('<?xml'));
});

test('GET /style.css serves the stylesheet as CSS', async () => {
  const res = await request('GET', '/style.css');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/css'));
});

test('GET /favicon.ico serves the favicon as an icon', async () => {
  const res = await request('GET', '/favicon.ico');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('image/x-icon'));
});

test('GET /api/listReports returns JSON with report data and records an API-operation metric', async () => {
  const countBefore = await getMetricCount('apiOperations', 'listReports');
  const res = await request('GET', '/api/listReports');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'listReports');
  assert.equal(await getMetricCount('apiOperations', 'listReports'), countBefore + 1);
});

test('GET /api/listIssues/260101T0000/mix returns JSON with issue data', async () => {
  const res = await request('GET', '/api/listIssues/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'listIssues');
});

test('GET /api/listViolators/linkNoText/260101T0000/mix returns JSON', async () => {
  const res = await request('GET', '/api/listViolators/linkNoText/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'listViolators');
});

test('GET /api/listDiagnoses/0/linkNoText/260101T0000/mix returns JSON', {timeout: 500}, async () => {
  const res = await request('GET', '/api/listDiagnoses/0/linkNoText/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'listDiagnoses');
});

test('GET /api/getReport/260101T0000/mix returns JSON with the report', async () => {
  const res = await request('GET', '/api/getReport/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'getReport');
});

test('GET /api/invalidService returns an error', {timeout: 500}, async () => {
  const res = await request('GET', '/api/invalidService');
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error);
});

test('GET /fullReport.json/260101T0000/mix downloads the report as JSON', async () => {
  const res = await request('GET', '/fullReport.json/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('application/json'));
  assert.ok(res.headers['content-disposition'].includes('attachment'));
  const body = jsonBody(res);
  assert.ok(body.target);
});

test('GET /fullReport.json/invalid/invalid returns an error page', {timeout: 500}, async () => {
  const res = await request('GET', '/fullReport.json/invalid/invalid');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.ok(res.body.includes('Invalid report request'));
});

test('GET /fullReport.json/990101T0000/xxx returns an abuse error for a nonexistent report', async () => {
  const res = await request('GET', '/fullReport.json/990101T0000/xxx');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
});

test('GET /tutorialWeb/images/newsletter-form.png serves the image', async () => {
  const res = await request('GET', '/tutorialWeb/images/newsletter-form.png');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('image/png'));
});

test('GET /tutorialWeb/images with an unknown extension serves octet-stream', async () => {
  // Create a temporary image file with an unknown extension.
  const imgPath = path.join(import.meta.dirname, 'web', 'tutorialWeb', 'images', 'test.bmp');
  await fs.writeFile(imgPath, 'fake bitmap data');
  try {
    const res = await request('GET', '/tutorialWeb/images/test.bmp');
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('application/octet-stream'));
  }
  finally {
    await fs.unlink(imgPath).catch(() => {});
  }
});

test('GET /tutorialWeb/images/nonexistent.png returns an error page', async () => {
  const res = await request('GET', '/tutorialWeb/images/nonexistent.png');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Image not found'));
});

test('GET /tutorialAI/images/test.png serves the image', async () => {
  // Create a temporary image file in tutorialAI.
  const imgPath = path.join(import.meta.dirname, 'web', 'tutorialAI', 'images', 'test.png');
  await fs.mkdir(path.dirname(imgPath), {recursive: true});
  await fs.writeFile(imgPath, 'fake png data');
  try {
    const res = await request('GET', '/tutorialAI/images/test.png');
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('image/png'));
  }
  finally {
    await fs.unlink(imgPath).catch(() => {});
  }
});

test('GET /tutorialAI/images/nonexistent.png returns an error page', async () => {
  const res = await request('GET', '/tutorialAI/images/nonexistent.png');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Image not found'));
});

test('GET /nonexistent.html returns an abuse error', {timeout: 500}, async () => {
  const res = await request('GET', '/nonexistent.html');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
});

test('GET /forbidden-path returns an invalid GET request error', async () => {
  const res = await request('GET', '/forbidden-path');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid GET request'));
});

// TESTS: POST routes

test('POST /requestTest.html with valid data returns an HTML page', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    description: `Unique Test Page ${uniqueStamp}`,
    url: `https://example.com/unique-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /requestTest.html with an already-tested URL returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    description: 'Mixed Outcomes Page',
    url: 'https://example.com/mixed',
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('already been tested'));
});

test('POST /requestTest.html with invalid data returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    description: '',
    url: 'not-a-url',
    why: ''
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid test request'));
});

test('POST /requestTest.html with an unreadable body returns an error', async () => {
  const res = await request('POST', '/requestTest.html', 'rawbody', {'content-type': 'text/plain'});
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Unreadable request body'));
});

test('POST /requestRetest.html/260202T0000/new with valid data returns HTML', async () => {
  // Reset testRequests.json to avoid duplicate-request errors from prior tests.
  await fs.writeFile(testRequestsPath, '{}\n');
  const res = await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: 'Because the report is obsolete and needs refreshing'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /requestRetest.html/invalid/invalid with invalid data returns an error', async () => {
  const res = await formRequest('POST', '/requestRetest.html/invalid/invalid', {
    why: 'Because'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid retest request'));
});

test('POST /api/requestTest with valid JSON returns a JSON response', {timeout: 500}, async () => {
  const res = await request('POST', '/api/requestTest', {
    description: `API Test Page ${uniqueStamp}`,
    URL: `https://example.com/api-test-${uniqueStamp}`,
    reason: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(body['tool name'] || body['response content']);
});

test('POST /api/requestRetest/260202T0000/new with valid JSON returns a JSON response', async () => {
  const res = await request('POST', '/api/requestRetest/260202T0000/new', {
    reason: 'Because the report is obsolete and needs refreshing'
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(body['tool name'] || body['response content']);
});

test('POST /api/requestFeature with valid JSON returns a JSON response and records an API-operation metric', async () => {
  const countBefore = await getMetricCount('apiOperations', 'requestFeature');
  const res = await request('POST', '/api/requestFeature', {
    feature: 'Add a dark mode toggle'
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(body['tool name'] || body['response content']);
  assert.equal(await getMetricCount('apiOperations', 'requestFeature'), countBefore + 1);
});

test('POST /api/invalidService returns an error', async () => {
  const res = await request('POST', '/api/invalidService', {data: 'test'});
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error);
});

test('POST /forbidden-path returns an invalid POST request error', async () => {
  const res = await request('POST', '/forbidden-path', {data: 'test'});
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid POST request'));
});

// TESTS: worker routes

test('POST /worker/job without authentication returns 401', async () => {
  const res = await request('POST', '/worker/job', {});
  assert.equal(res.statusCode, 401);
  const body = jsonBody(res);
  assert.ok(body.error.message.includes('Unauthorized'));
});

test('POST /worker/job when TESTARO_WORKERS is unset returns 401', async () => {
  const saved = process.env.TESTARO_WORKERS;
  delete process.env.TESTARO_WORKERS;
  try {
    const auth = Buffer.from('worker1:secret1').toString('base64');
    const res = await request('POST', '/worker/job', {}, {
      authorization: `Basic ${auth}`
    });
    assert.equal(res.statusCode, 401);
  }
  finally {
    process.env.TESTARO_WORKERS = saved;
  }
});

test('POST /worker/job when TESTARO_WORKERS is invalid JSON returns 401', async () => {
  const saved = process.env.TESTARO_WORKERS;
  process.env.TESTARO_WORKERS = 'not valid JSON {';
  try {
    const auth = Buffer.from('worker1:secret1').toString('base64');
    const res = await request('POST', '/worker/job', {}, {
      authorization: `Basic ${auth}`
    });
    assert.equal(res.statusCode, 401);
  }
  finally {
    process.env.TESTARO_WORKERS = saved;
  }
});

test('POST /worker/job with valid authentication returns a job or no-job response', async () => {
  // Clean up any claimed jobs left by prior tests.
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const claimedFiles = await fs.readdir(claimedDir).catch(() => []);
  for (const file of claimedFiles) {
    await fs.unlink(path.join(claimedDir, file)).catch(() => {});
  }
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const res = await request('POST', '/worker/job', {}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(typeof body === 'object');
});

test('POST /worker/report with invalid authentication returns 401', async () => {
  const res = await request('POST', '/worker/report', {report: {}}, {
    authorization: 'Basic invalid'
  });
  assert.equal(res.statusCode, 401);
});

test('POST /worker/report with valid authentication but invalid report returns an error', async () => {
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const res = await request('POST', '/worker/report', {report: {}}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error);
});

test('POST /worker/report with valid authentication but no report field returns an error', async () => {
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const res = await request('POST', '/worker/report', {}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error);
});

// TESTS: error handling

test('PUT / returns an invalid method error', async () => {
  const res = await request('PUT', '/');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request method'));
});

// TESTS: requestHandler catch boundary

test('GET /listReports.html returns a 500 error when an unexpected internal error occurs', {timeout: 500}, async () => {
  // Corrupt testRequests.json so that getTestRequests throws, an error that should never occur in normal
  // operation and so is not handled by handleRequest itself, only by requestHandler's
  // outer catch boundary.
  const backup = await fs.readFile(testRequestsPath, 'utf8');
  await fs.writeFile(testRequestsPath, 'not valid json');
  try {
    const res = await request('GET', '/listReports.html');
    assert.equal(res.statusCode, 500);
    assert.ok(res.headers['content-type'].includes('application/json'));
    const body = jsonBody(res);
    assert.ok(body.error);
  }
  finally {
    await fs.writeFile(testRequestsPath, backup);
  }
});

// TESTS: serveError behavior

test('serveError sends JSON for agent requests (isHumanUser = false)', async () => {
  const res = await request('GET', '/api/invalidService');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('application/json'));
  const body = jsonBody(res);
  assert.ok(body.error);
});

test('serveError sends HTML for human requests (isHumanUser = true)', async () => {
  const res = await request('GET', '/forbidden-path');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

// TESTS: requestAction.html

test('POST /requestAction.html with invalid auth code returns an error and records a managerActivity failure', {timeout: 500}, async () => {
  const countBefore = await getManagerActivityCount('requestAction.html', 'error');
  const res = await formRequest('POST', '/requestAction.html', {
    target: 'https://example.com\tTest Page',
    authCode: 'wrong-code'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
  assert.equal(await getManagerActivityCount('requestAction.html', 'error'), countBefore + 1);
});

test('POST /requestAction.html with valid auth code and rejection (no description) returns HTML and records a managerActivity success', async () => {
  await formRequest('POST', '/requestTest.html', {
    description: `Reject Test Page ${uniqueStamp}`,
    url: `https://example.com/reject-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  const countBefore = await getManagerActivityCount('requestAction.html', 'ok');
  const res = await formRequest('POST', '/requestAction.html', {
    target: `https://example.com/reject-${uniqueStamp}`,
    authCode: 'test-auth-code'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.equal(await getManagerActivityCount('requestAction.html', 'ok'), countBefore + 1);
});

// TESTS: tutorialWeb (web user tutorial)

test('GET /tutorialWeb.html returns HTML and records a page-view metric', async () => {
  const countBefore = await getMetricCount('pageViews', 'tutorialWeb');
  const res = await request('GET', '/tutorialWeb.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.equal(await getMetricCount('pageViews', 'tutorialWeb'), countBefore + 1);
});

test('POST /tutorialWebComment.html with content returns JSON', async () => {
  const res = await request('POST', '/tutorialWebComment.html', {
    content: `This is a test comment ${uniqueStamp}`
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
  assert.deepEqual(JSON.parse(res.body), {status: 'ok'});
});

// TESTS: additional branch coverage

test('GET /fullReport.json/260101T0007/hid returns an error for an unavailable report', async () => {
  const res = await request('GET', '/fullReport.json/260101T0007/hid');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
});

test('POST /requestAction.html with valid auth code and approval returns HTML', {timeout: 500}, async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  await formRequest('POST', '/requestTest.html', {
    description: `Approval Test Page ${uniqueStamp}`,
    url: `https://example.com/approval-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  const res = await formRequest('POST', '/requestAction.html', {
    target: `https://example.com/approval-${uniqueStamp}\tApproval Test Page ${uniqueStamp}`,
    authCode: 'test-auth-code'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /reannotate.html with invalid auth code returns an error page and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('reannotate.html', 'error');
  const res = await formRequest('POST', '/reannotate.html', {
    authCode: 'wrong-code'
  });
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.equal(await getManagerActivityCount('reannotate.html', 'error'), countBefore + 1);
});

test('POST /reannotate.html with valid auth code serves the answer page and records a managerActivity success', async () => {
  // Back up all fixture reports, because reannotation modifies them in place.
  const reportsDir = path.join(fixtureDBDir, 'reports');
  const reportFiles = await fs.readdir(reportsDir);
  const backups: Record<string, string> = {};
  for (const file of reportFiles) {
    backups[file] = await fs.readFile(path.join(reportsDir, file), 'utf8');
  }
  try {
    const countBefore = await getManagerActivityCount('reannotate.html', 'ok');
    const res = await formRequest('POST', '/reannotate.html', {
      authCode: 'test-auth-code'
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('Reannotation order'));
    assert.equal(await getManagerActivityCount('reannotate.html', 'ok'), countBefore + 1);
  }
  finally {
    // Restore all fixture reports.
    for (const file of reportFiles) {
      await fs.writeFile(path.join(reportsDir, file), backups[file]!);
    }
  }
});

test('POST /renewWCAG.html with invalid auth code returns an error page and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('renewWCAG.html', 'error');
  const res = await formRequest('POST', '/renewWCAG.html', {
    authCode: 'wrong-code'
  });
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.equal(await getManagerActivityCount('renewWCAG.html', 'error'), countBefore + 1);
});

test('POST /renewWCAG.html with valid auth code serves the answer page and records a managerActivity success', async () => {
  // Mock fetch to avoid a network dependency.
  const originalFetch = global.fetch;
  const wcagMapPath = path.join(import.meta.dirname, 'wcagMap.json');
  const wcagMapBackup = await fs.readFile(wcagMapPath, 'utf8');
  // @ts-expect-error: Replacing the real function with a mock for testing.
  global.fetch = async () => ({
    status: 200,
    text: async () => '<a href="understanding/contrast-minimum"><span class="secno">1.4.3 </span>'
  });
  try {
    const countBefore = await getManagerActivityCount('renewWCAG.html', 'ok');
    const res = await formRequest('POST', '/renewWCAG.html', {
      authCode: 'test-auth-code'
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('WCAG map renewed'));
    assert.equal(await getManagerActivityCount('renewWCAG.html', 'ok'), countBefore + 1);
  }
  finally {
    global.fetch = originalFetch;
    await fs.writeFile(wcagMapPath, wcagMapBackup);
  }
});

test('POST /tutorialWebComment.html with empty content returns a JSON error', {timeout: 500}, async () => {
  const res = await request('POST', '/tutorialWebComment.html', {
    content: ''
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
});

// TESTS: tutorialAI (AI agent configuration tutorial)

test('GET /tutorialAI.html returns HTML', async () => {
  const res = await request('GET', '/tutorialAI.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /tutorialAIComment.html with content returns JSON', async () => {
  const res = await request('POST', '/tutorialAIComment.html', {
    content: `This is a test AI tutorial comment ${uniqueStamp}`
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
  assert.deepEqual(JSON.parse(res.body), {status: 'ok'});
});

test('POST /tutorialAIComment.html with empty content returns a JSON error', {timeout: 500}, async () => {
  const res = await request('POST', '/tutorialAIComment.html', {
    content: ''
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
});

test('GET /qai redirects to /tutorialAI.html', async () => {
  const res = await request('GET', '/qai', {}, {followRedirects: false});
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/tutorialAI.html');
});

test('GET /qai/comments redirects to /tutorialAI.html', async () => {
  const res = await request('GET', '/qai/comments', {}, {followRedirects: false});
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/tutorialAI.html');
});

test('GET /diagnoses.html/<segments> redirects to the equivalent /listDiagnoses.html/<segments>, preserving the query string', async () => {
  const res = await request(
    'GET', '/diagnoses.html/duplicateID/260426T1741/77w/718?pathID=/html/body', {}, {followRedirects: false}
  );
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/listDiagnoses.html/duplicateID/260426T1741/77w/718?pathID=/html/body');
});

test('GET /reportIssues.html/<timeStamp>/<jobID> redirects to the equivalent /listIssues.html/<timeStamp>/<jobID>', async () => {
  const res = await request('GET', '/reportIssues.html/260101T0000/mix', {}, {followRedirects: false});
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/listIssues.html/260101T0000/mix');
});

test('GET /reportIssue.html/<segments> redirects to the equivalent /listViolators.html/<segments>', async () => {
  const res = await request(
    'GET', '/reportIssue.html/duplicateID/260101T0000/mix', {}, {followRedirects: false}
  );
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/listViolators.html/duplicateID/260101T0000/mix');
});

test('GET /rules.html/<segment> redirects to the equivalent /listRules.html/<segment>', async () => {
  const res = await request('GET', '/rules.html/allCaps', {}, {followRedirects: false});
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/listRules.html/allCaps');
});

test('GET /targets.html redirects to /listReports.html', async () => {
  const res = await request('GET', '/targets.html', {}, {followRedirects: false});
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers['location'], '/listReports.html');
});

test('POST /requestTest.html with non-https URL returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    description: 'Test Page',
    url: 'http://example.com',
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid test request'));
});

test('POST /requestTest.html with a private-address URL returns an error unless internal targets are allowed', async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  try {
    const res = await formRequest('POST', '/requestTest.html', {
      description: 'Internal Page',
      url: 'https://192.168.1.1/page',
      why: 'Because accessibility matters'
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.includes('Invalid test request'));
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
  }
});

test('POST /requestRetest.html/260202T0000/new with missing why returns an error', async () => {
  const res = await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: ''
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid retest request'));
});

test('POST /worker/report with valid authentication and wrong worker returns an error', async () => {
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const report = {
    id: '260101T0000-mix',
    target: {what: 'Test', url: 'https://example.com/test'},
    acts: []
  };
  const res = await request('POST', '/worker/report', {report}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error);
});

test('POST /worker/report with a claimed job file that is not valid JSON returns a 500 error', {timeout: 500}, async () => {
  // A corrupt claimed-job file is not the normal "no such claim" outcome (ENOENT), so it
  // should propagate as an unexpected error rather than being treated as an unassigned job.
  const jobID = '990101T0002-bad';
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const jobPath = path.join(claimedDir, `${jobID}.json`);
  await fs.writeFile(jobPath, 'not valid json');
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const report = {
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'}
  };
  try {
    const res = await request('POST', '/worker/report', {report}, {
      authorization: `Basic ${auth}`
    });
    assert.equal(res.statusCode, 500);
    const body = jsonBody(res);
    assert.ok(body.error);
  }
  finally {
    await fs.unlink(jobPath).catch(() => {});
  }
});

test('POST /worker/job with wrong secret returns 401', async () => {
  const auth = Buffer.from('worker1:wrongsecret').toString('base64');
  const res = await request('POST', '/worker/job', {}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 401);
});

test('POST /worker/job with malformed authorization header returns 401', async () => {
  const res = await request('POST', '/worker/job', {}, {
    authorization: 'NotBasic abc'
  });
  assert.equal(res.statusCode, 401);
});

test('POST /worker/job with malformed base64 returns 401', async () => {
  const res = await request('POST', '/worker/job', {}, {
    authorization: 'Basic !!!'
  });
  assert.equal(res.statusCode, 401);
});

test('POST /worker/job with no colon in decoded credentials returns 401', async () => {
  const auth = Buffer.from('nocolonhere').toString('base64');
  const res = await request('POST', '/worker/job', {}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 401);
});

// TESTS: processJobRequest branches

test('POST /worker/job with a claimed job assigned to the worker returns an error and reclassifies the job', {timeout: 500}, async () => {
  // Create a claimed job assigned to Worker One.
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const failedDir = path.join(fixtureDBDir, 'jobs', 'failed');
  const jobFile = '260101T0000-mix.json';
  const claimedJobPath = path.join(claimedDir, jobFile);
  const failedJobPath = path.join(failedDir, jobFile);
  // Clean up any existing files.
  await fs.unlink(failedJobPath).catch(() => {});
  await fs.writeFile(claimedJobPath, JSON.stringify({
    id: '260101T0000-mix',
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker One'}
  }));
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const res = await request('POST', '/worker/job', {}, {
    authorization: `Basic ${auth}`
  });
  // The worker should get an error about the incomplete job.
  const body = jsonBody(res);
  assert.ok(body.error.message.includes('has not completed job'));
  // Wait for the async rename to complete.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  // The job should have been moved to failed.
  const failedExists = await fs.access(failedJobPath).then(() => true).catch(() => false);
  assert.ok(failedExists, 'Job should be moved to failed directory');
  // Clean up.
  await fs.unlink(failedJobPath).catch(() => {});
});

test('POST /worker/job skips a claimed job file that disappears between the directory listing and the read', {timeout: 500}, async (t) => {
  // Create a claimed job assigned to a different worker, so it does not match this
  // worker and would otherwise just be skipped normally, then make the read of that
  // specific file (not the directory listing) throw ENOENT, simulating the file
  // vanishing between getJobNames listing the claimed directory and this loop's read
  // of the file it found there (e.g. because a concurrent report submission completed
  // the job just after the listing).
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  for (const dir of [claimedDir, queueDir]) {
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
  const jobFile = '260101T0000-mix.json';
  const claimedJobPath = path.join(claimedDir, jobFile);
  await fs.writeFile(claimedJobPath, JSON.stringify({
    id: '260101T0000-mix',
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker Two'}
  }));
  const originalReadFile = fs.readFile;
  t.mock.method(fs, 'readFile', async (filePath: any, ...rest: any[]) => {
    if (String(filePath) === claimedJobPath) {
      await fs.unlink(claimedJobPath);
      const error: any = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      throw error;
    }
    return (originalReadFile as any)(filePath, ...rest);
  });
  try {
    const auth = Buffer.from('worker1:secret1').toString('base64');
    const res = await request('POST', '/worker/job', {}, {
      authorization: `Basic ${auth}`
    });
    // With no queued jobs and the claimed job having vanished mid-read, the worker
    // should just get told there is no job, rather than a 500 error from an
    // unhandled ENOENT.
    assert.equal(res.statusCode, 200);
    const body = jsonBody(res);
    assert.ok(!body.error);
  }
  finally {
    t.mock.reset();
    await fs.unlink(claimedJobPath).catch(() => {});
  }
});

test('POST /worker/job propagates a non-ENOENT failure to read a claimed job file', {timeout: 500}, async (t) => {
  // The catch in processJobRequest's claimed-job loop rethrows any failure other than
  // the file having vanished (ENOENT). This confirms that a different failure, such as
  // a permissions error, is not swallowed alongside the expected race condition.
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  for (const dir of [claimedDir, queueDir]) {
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
  const jobFile = '260101T0000-mix.json';
  const claimedJobPath = path.join(claimedDir, jobFile);
  await fs.writeFile(claimedJobPath, JSON.stringify({
    id: '260101T0000-mix',
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker Two'}
  }));
  const originalReadFile = fs.readFile;
  t.mock.method(fs, 'readFile', async (filePath: any, ...rest: any[]) => {
    if (String(filePath) === claimedJobPath) {
      const error: any = new Error('EACCES: permission denied');
      error.code = 'EACCES';
      throw error;
    }
    return (originalReadFile as any)(filePath, ...rest);
  });
  try {
    const auth = Buffer.from('worker1:secret1').toString('base64');
    const res = await request('POST', '/worker/job', {}, {
      authorization: `Basic ${auth}`
    });
    // The request should fail loudly rather than silently proceeding as if there
    // were no claimed job.
    assert.equal(res.statusCode, 500);
  }
  finally {
    t.mock.reset();
    await fs.unlink(claimedJobPath).catch(() => {});
  }
});

test('POST /worker/job with a queued job assigns it to the worker', {timeout: 500}, async () => {
  // Clean up claimed and queue directories.
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  for (const dir of [claimedDir, queueDir]) {
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
  // Create a queued job.
  const jobFile = '260101T0000-mix.json';
  await fs.writeFile(path.join(queueDir, jobFile), JSON.stringify({
    id: '260101T0000-mix',
    target: {what: 'Test Page', url: 'https://example.com/test'},
    sources: {}
  }));
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const res = await request('POST', '/worker/job', {}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.id, '260101T0000-mix');
  assert.equal(body.sources.worker, 'Worker One');
  // Wait for the async unlink to complete.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  // The job should have been moved from queue to claimed.
  const queueExists = await fs.access(path.join(queueDir, jobFile)).then(() => true).catch(() => false);
  assert.equal(queueExists, false, 'Job should be removed from queue');
  const claimedExists = await fs.access(path.join(claimedDir, jobFile)).then(() => true).catch(() => false);
  assert.ok(claimedExists, 'Job should be moved to claimed directory');
  // Clean up.
  await fs.unlink(path.join(claimedDir, jobFile)).catch(() => {});
});

// TESTS: worker/report valid submission

test('POST /worker/report with valid authentication and valid claimed job processes the report', {timeout: 500}, async () => {
  // Use a unique job ID that does not conflict with existing fixtures.
  const jobID = '990101T0000-tst';
  const reportPath = path.join(fixtureDBDir, 'reports', `${jobID}.json`);
  // Clean up any leftover report file.
  await fs.unlink(reportPath).catch(() => {});
  // Create a claimed job assigned to Worker One.
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const jobPath = path.join(claimedDir, `${jobID}.json`);
  await fs.writeFile(jobPath, JSON.stringify({
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker One'}
  }));
  const auth = Buffer.from('worker1:secret1').toString('base64');
  const report = {
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'},
    acts: [{type: 'test', which: 'axe', result: {standardResult: {instances: []}}}],
    jobData: {endTime: '26-01-01T00:00'},
    catalog: {}
  };
  const res = await request('POST', '/worker/report', {report}, {
    authorization: `Basic ${auth}`
  });
  // Clean up the report file and any remaining claimed job.
  await fs.unlink(reportPath).catch(() => {});
  await fs.unlink(jobPath).catch(() => {});
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.status, 'ok');
});

test('POST /worker/report with a claimed job but an unusable report returns an error and reclassifies the job', {timeout: 500}, async () => {
  // Use a unique job ID that does not conflict with existing fixtures.
  const jobID = '990101T0001-unu';
  const reportPath = path.join(fixtureDBDir, 'reports', `${jobID}.json`);
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const failedDir = path.join(fixtureDBDir, 'jobs', 'failed');
  const jobFile = `${jobID}.json`;
  const claimedJobPath = path.join(claimedDir, jobFile);
  const failedJobPath = path.join(failedDir, jobFile);
  // Clean up any leftover files.
  await fs.unlink(reportPath).catch(() => {});
  await fs.unlink(failedJobPath).catch(() => {});
  // Create a claimed job assigned to Worker One.
  await fs.writeFile(claimedJobPath, JSON.stringify({
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'},
    sources: {worker: 'Worker One'}
  }));
  const auth = Buffer.from('worker1:secret1').toString('base64');
  // A report that is syntactically valid (has id, target.what, target.url) but is not
  // usable by Kilotest, because it has no acts, jobData, or catalog.
  const report = {
    id: jobID,
    target: {what: 'Test', url: 'https://example.com/test'}
  };
  const res = await request('POST', '/worker/report', {report}, {
    authorization: `Basic ${auth}`
  });
  assert.equal(res.statusCode, 400);
  const body = jsonBody(res);
  assert.ok(body.error.message.includes('not usable'));
  // The report should not have been recorded.
  const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
  assert.equal(reportExists, false, 'Unusable report should not be saved');
  // Wait for the async rename to complete.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  // The job should have been reclassified as failed rather than left claimed.
  const failedExists = await fs.access(failedJobPath).then(() => true).catch(() => false);
  assert.ok(failedExists, 'Job should be moved to the failed directory');
  const claimedExists = await fs.access(claimedJobPath).then(() => true).catch(() => false);
  assert.equal(claimedExists, false, 'Job should be removed from the claimed directory');
  // Clean up.
  await fs.unlink(failedJobPath).catch(() => {});
});

test('POST /worker/report with a report on a disallowed target rejects it and reclassifies the job', {timeout: 500}, async () => {
  delete process.env.ALLOW_INTERNAL_TARGETS;
  // Use a unique job ID that does not conflict with existing fixtures.
  const jobID = '990101T0002-ssr';
  const reportPath = path.join(fixtureDBDir, 'reports', `${jobID}.json`);
  const claimedDir = path.join(fixtureDBDir, 'jobs', 'claimed');
  const failedDir = path.join(fixtureDBDir, 'jobs', 'failed');
  const jobFile = `${jobID}.json`;
  const claimedJobPath = path.join(claimedDir, jobFile);
  const failedJobPath = path.join(failedDir, jobFile);
  try {
    // Clean up any leftover files.
    await fs.unlink(reportPath).catch(() => {});
    await fs.unlink(failedJobPath).catch(() => {});
    // Create a claimed job assigned to Worker One.
    await fs.writeFile(claimedJobPath, JSON.stringify({
      id: jobID,
      target: {what: 'Test', url: 'https://example.com/test'},
      sources: {worker: 'Worker One'}
    }));
    const auth = Buffer.from('worker1:secret1').toString('base64');
    // A report that is otherwise usable, but whose test act was redirected (actualURL)
    // to a private address that this deployment does not allow as a testing target.
    const report = {
      id: jobID,
      target: {what: 'Test', url: 'https://example.com/test'},
      acts: [{
        type: 'test', which: 'axe', actualURL: 'https://192.168.1.1/test',
        result: {standardResult: {instances: []}}
      }],
      jobData: {endTime: '26-01-01T00:00'},
      catalog: {}
    };
    const res = await request('POST', '/worker/report', {report}, {
      authorization: `Basic ${auth}`
    });
    assert.equal(res.statusCode, 400);
    const body = jsonBody(res);
    assert.ok(body.error.message.includes('disallowed target'));
    // The report should not have been recorded.
    const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
    assert.equal(reportExists, false, 'Report on a disallowed target should not be saved');
    // Wait for the async rename to complete.
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    // The job should have been reclassified as failed rather than left claimed.
    const failedExists = await fs.access(failedJobPath).then(() => true).catch(() => false);
    assert.ok(failedExists, 'Job should be moved to the failed directory');
    const claimedExists = await fs.access(claimedJobPath).then(() => true).catch(() => false);
    assert.equal(claimedExists, false, 'Job should be removed from the claimed directory');
  } finally {
    process.env.ALLOW_INTERNAL_TARGETS = 'true';
    // Clean up.
    await fs.unlink(failedJobPath).catch(() => {});
  }
});

// TESTS: remaining error branches and web pages

test('GET /style.css with a read error returns an error page', async () => {
  // Temporarily rename style.css to trigger a read error.
  const stylePath = path.join(import.meta.dirname, 'style.css');
  const tempPath = path.join(import.meta.dirname, 'style.css.bak');
  await fs.rename(stylePath, tempPath);
  try {
    const res = await request('GET', '/style.css');
    assert.equal(res.statusCode, 400);
    assert.ok(res.headers['content-type'].includes('text/html'));
  }
  finally {
    await fs.rename(tempPath, stylePath);
  }
});

// requestTest.html and requestRetest.html are POST-only routes (see the
// `routes.POST` list above). They also match the generic '*.html*' GET pattern,
// but the generic `pageName.endsWith('.html')` branch of the GET dispatcher
// excludes any path that is POST-only, since such a path's answer handler
// expects POST's argument list and performs no GET-appropriate rendering.

test('GET /requestTest.html without arguments is rejected as an invalid GET request', async () => {
  const res = await request('GET', '/requestTest.html');
  assert.equal(res.statusCode, 400);
});

test('GET /requestRetest.html/260202T0000/new is rejected as an invalid GET request', async () => {
  const res = await request('GET', '/requestRetest.html/260202T0000/new');
  assert.equal(res.statusCode, 400);
});

// TESTS: GET HTML page routing
// These verify that the HTTP routing layer connects each URL to the correct
// handler and returns HTML with a 200 status. The handler logic itself is
// tested by the unit tests in web/*/*.test.cjs.

const htmlPagePaths = [
  '/listReports.html',
  '/listViolators.html/linkNoText/260101T0000/mix',
  '/listDiagnoses.html/linkNoText/260101T0000/mix/0',
  '/enqueueForm.html',
  '/manage.html',
  '/tutorialWeb.html',
  '/tutorialAI.html',
  '/listTopIssues.html',
  '/reannotateForm.html',
  '/renewWCAGForm.html',
  '/hideReportForm.html',
  '/showHiddenReportsForm.html',
  '/expungeReportsForm.html',
  '/pruneReportsForm.html',
  '/rewindReportsForm.html',
  '/ai0BalanceForm.html',
  '/deleteNotesForm.html',
  '/metrics.html'
];

for (const pagePath of htmlPagePaths) {
  test(`GET ${pagePath} serves a generated HTML page`, {timeout: 500}, async () => {
    const res = await request('GET', pagePath);
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
  });
}

test('POST /metrics.html with a valid authCode serves the usage-metrics table and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('metrics', 'ok');
  const res = await formRequest('POST', '/metrics.html', {authCode: 'test-auth-code'});
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.equal(await getManagerActivityCount('metrics', 'ok'), countBefore + 1);
});

test('POST /metrics.html with a valid authCode sets a metrics-exclusion cookie', async () => {
  const res = await formRequest('POST', '/metrics.html', {authCode: 'test-auth-code'});
  const setCookie = res.headers['set-cookie']?.[0] ?? res.headers['set-cookie'];
  assert.ok(setCookie);
  assert.ok(setCookie.startsWith('kilotestExclude='));
  assert.ok(setCookie.includes('Max-Age=2592000'));
  assert.ok(setCookie.includes('HttpOnly'));
});

test('GET /metrics.html with a valid authCode in the query string does not set a cookie or show the counts', async () => {
  const res = await request('GET', '/metrics.html?authCode=test-auth-code');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['set-cookie'], undefined);
  assert.ok(res.body.includes('Authorization code'));
  assert.ok(!res.body.includes('Web page views'));
});

test('a request carrying the metrics-exclusion cookie does not record a pageViews or apiOperations metric', async () => {
  const {getExclusionCookieValue} = await import('./util.ts');
  const cookieHeader = `kilotestExclude=${getExclusionCookieValue()}`;
  const pageViewCountBefore = await getMetricCount('pageViews', 'tutorialWeb');
  const apiOperationCountBefore = await getMetricCount('apiOperations', 'listReports');
  await request('GET', '/tutorialWeb.html', null, {cookie: cookieHeader});
  await request('GET', '/api/listReports', null, {cookie: cookieHeader});
  assert.equal(await getMetricCount('pageViews', 'tutorialWeb'), pageViewCountBefore);
  assert.equal(await getMetricCount('apiOperations', 'listReports'), apiOperationCountBefore);
});

test('a request carrying an invalid exclusion cookie still records metrics normally', async () => {
  const pageViewCountBefore = await getMetricCount('pageViews', 'tutorialWeb');
  await request('GET', '/tutorialWeb.html', null, {cookie: 'kilotestExclude=wrong-value'});
  assert.equal(await getMetricCount('pageViews', 'tutorialWeb'), pageViewCountBefore + 1);
});

test('a request with an unrelated cookie still records metrics normally', async () => {
  const pageViewCountBefore = await getMetricCount('pageViews', 'tutorialWeb');
  await request('GET', '/tutorialWeb.html', null, {cookie: 'someOtherCookie=1'});
  assert.equal(await getMetricCount('pageViews', 'tutorialWeb'), pageViewCountBefore + 1);
});

test('GET / and GET /index.html record a pageViews metric under "index"', async () => {
  const countBefore = await getMetricCount('pageViews', 'index');
  await request('GET', '/');
  await request('GET', '/index.html');
  assert.equal(await getMetricCount('pageViews', 'index'), countBefore + 2);
});

test('POST /metrics.html with an invalid authCode is rejected and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('metrics', 'error');
  const res = await formRequest('POST', '/metrics.html', {authCode: 'wrong'});
  assert.equal(res.statusCode, 400);
  assert.equal(await getManagerActivityCount('metrics', 'error'), countBefore + 1);
});

test('GET /hideReportForm.html records managerActivity, not a pageViews entry', async () => {
  const managerCountBefore = await getManagerActivityCount('hideReportForm', 'ok');
  const pageViewCountBefore = await getMetricCount('pageViews', 'hideReportForm');
  const res = await request('GET', '/hideReportForm.html');
  assert.equal(res.statusCode, 200);
  assert.equal(await getManagerActivityCount('hideReportForm', 'ok'), managerCountBefore + 1);
  assert.equal(await getMetricCount('pageViews', 'hideReportForm'), pageViewCountBefore);
});

// TESTS: hidden report list is never served on a direct GET, only via showHiddenReports

test('GET /unhideReportForm.html is rejected, since the hidden-report list must not be disclosed without an authorization code', async () => {
  const res = await request('GET', '/unhideReportForm.html');
  assert.equal(res.statusCode, 400);
  assert.ok(!res.body.includes('260101T0007-hid'));
});

test('GET /showHiddenReportsForm.html displays a bare authCode form, disclosing no report names', async () => {
  const res = await request('GET', '/showHiddenReportsForm.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('Authorization code'));
  assert.ok(!res.body.includes('260101T0007-hid'));
});

test('POST /showHiddenReportsForm.html with a valid authCode serves the hidden-report list and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('showHiddenReportsForm', 'ok');
  const res = await formRequest('POST', '/showHiddenReportsForm.html', {authCode: 'test-auth-code'});
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('type="radio"'));
  assert.equal(await getManagerActivityCount('showHiddenReportsForm', 'ok'), countBefore + 1);
});

test('POST /showHiddenReportsForm.html with an invalid authCode is rejected and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('showHiddenReportsForm', 'error');
  const res = await formRequest('POST', '/showHiddenReportsForm.html', {authCode: 'wrong'});
  assert.equal(res.statusCode, 400);
  assert.equal(await getManagerActivityCount('showHiddenReportsForm', 'error'), countBefore + 1);
});

// TESTS: self-submitting manager pages now POST their own submissions (formerly GET)

test('POST /ai0BalanceForm.html with a valid authCode records the balance and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('ai0BalanceForm', 'ok');
  const res = await formRequest('POST', '/ai0BalanceForm.html', {
    newBalance: '42.50',
    authCode: 'test-auth-code'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.ok(res.body.includes('$42.5'));
  assert.equal(await getManagerActivityCount('ai0BalanceForm', 'ok'), countBefore + 1);
});

test('POST /ai0BalanceForm.html with an invalid authCode is rejected and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('ai0BalanceForm', 'error');
  const res = await formRequest('POST', '/ai0BalanceForm.html', {
    newBalance: '10',
    authCode: 'wrong-code'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(await getManagerActivityCount('ai0BalanceForm', 'error'), countBefore + 1);
});

test('POST /hideReportForm.html with an invalid authCode is rejected and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('hideReportForm', 'error');
  const res = await formRequest('POST', '/hideReportForm.html', {
    report: '260101T0009-brd',
    authCode: 'wrong-code'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(await getManagerActivityCount('hideReportForm', 'error'), countBefore + 1);
});

test('POST /unhideReportForm.html with an invalid authCode is rejected and records a managerActivity failure', async () => {
  const countBefore = await getManagerActivityCount('unhideReportForm', 'error');
  const res = await formRequest('POST', '/unhideReportForm.html', {
    report: '260101T0009-brd',
    authCode: 'wrong-code'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(await getManagerActivityCount('unhideReportForm', 'error'), countBefore + 1);
});

test('POST /expungeReportsForm.html with no selections shows the form and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('expungeReportsForm', 'ok');
  const res = await formRequest('POST', '/expungeReportsForm.html', {});
  assert.equal(res.statusCode, 200);
  assert.equal(await getManagerActivityCount('expungeReportsForm', 'ok'), countBefore + 1);
});

test('POST /pruneReportsForm.html with no selections shows the form and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('pruneReportsForm', 'ok');
  const res = await formRequest('POST', '/pruneReportsForm.html', {});
  assert.equal(res.statusCode, 200);
  assert.equal(await getManagerActivityCount('pruneReportsForm', 'ok'), countBefore + 1);
});

test('POST /rewindReportsForm.html with no selections shows the form and records a managerActivity success', async () => {
  const countBefore = await getManagerActivityCount('rewindReportsForm', 'ok');
  const res = await formRequest('POST', '/rewindReportsForm.html', {});
  assert.equal(res.statusCode, 200);
  assert.equal(await getManagerActivityCount('rewindReportsForm', 'ok'), countBefore + 1);
});

test('POST /deleteNotesForm.html deletes multiple selected notes across sources in one submission', async () => {
  await fs.writeFile(process.env.TUTORIAL_WEB_COMMENTS_PATH!, JSON.stringify([
    {timeStamp: '260101T0000', content: 'A web tutorial comment'}
  ]));
  await fs.writeFile(process.env.FEATURE_REQUESTS_PATH!, JSON.stringify([
    {timeStamp: '260101T0001', content: 'A feature request'},
    {timeStamp: '260101T0001', content: 'A different feature request'}
  ]));
  // Reconstructing the POST body's query string uses querystring.stringify, which (unlike
  // the URLSearchParams object constructor) preserves multiple values for the same field
  // name as repeated key=value pairs rather than collapsing them into one comma-joined
  // value, so this exercises that multi-checkbox submission actually deletes every
  // selected note, not just the one whose value happens to survive the collapse.
  const res = await formRequest('POST', '/deleteNotesForm.html', [
    ['authCode', 'test-auth-code'],
    ['note', `tutorialWeb\t${encodeURIComponent('A web tutorial comment')}`],
    ['note', `featureRequest\t${encodeURIComponent('A feature request')}`]
  ]);
  assert.equal(res.statusCode, 200);
  const webComments = JSON.parse(await fs.readFile(process.env.TUTORIAL_WEB_COMMENTS_PATH!, 'utf8'));
  assert.equal(webComments.length, 0);
  const featureRequests = JSON.parse(await fs.readFile(process.env.FEATURE_REQUESTS_PATH!, 'utf8'));
  assert.equal(featureRequests.length, 1);
  assert.equal(featureRequests[0].content, 'A different feature request');
});

test('GET /pruneReportsForm.html records a managerActivity failure when a report file is corrupt', {timeout: 500}, async () => {
  const reportPath = path.join(fixtureDBDir, 'reports', '260101T0001-ct.json');
  const backup = await fs.readFile(reportPath, 'utf8');
  const countBefore = await getManagerActivityCount('pruneReportsForm', 'error');
  try {
    await fs.writeFile(reportPath, 'not valid json');
    const res = await request('GET', '/pruneReportsForm.html');
    assert.equal(res.statusCode, 400);
    assert.equal(await getManagerActivityCount('pruneReportsForm', 'error'), countBefore + 1);
  }
  finally {
    await fs.writeFile(reportPath, backup);
  }
});

test('GET /enqueueForm.html shows requests when testRequests.json has entries', async () => {
  await fs.writeFile(testRequestsPath, JSON.stringify({
    'https://example.com/enqueue-test': [
      {description: 'Enqueue Test Page', why: 'Needs testing for accessibility'}
    ]
  }));
  const res = await request('GET', '/enqueueForm.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('https://example.com/enqueue-test'));
  assert.ok(res.body.includes('Enqueue Test Page'));
});

test('GET /listRules.html returns an error page when called without arguments', async () => {
  const res = await request('GET', '/listRules.html');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

// TESTS: catch-all and MCP branches

test('GET /test.html.bak matches isPathAllowed but falls through to catch-all', async () => {
  const res = await request('GET', '/test.html.bak');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid GET request'));
});

test('GET /mcp with an SSE-capable Accept header returns a JSON-RPC 405 error instead of opening an SSE stream', async () => {
  const res = await request('GET', '/mcp', null, {accept: 'application/json, text/event-stream'});
  assert.equal(res.statusCode, 405);
  const body = jsonBody(res);
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.error.code, -32000);
});

test('GET /mcp without an SSE-capable Accept header serves an HTML explanation page instead of the MCP protocol response', async () => {
  const res = await request('GET', '/mcp', null, {accept: 'text/html'});
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.ok(res.body.includes('/tutorialAI.html'));
});

test('POST /mcp without an SSE-capable Accept header returns a JSON-RPC 406 error', async () => {
  const res = await request('POST', '/mcp', {jsonrpc: '2.0', method: 'initialize', id: 1, params: {}});
  assert.equal(res.statusCode, 406);
  assert.equal(jsonBody(res).error.code, -32000);
});

test('POST /mcp with malformed JSON returns a JSON-RPC 400 parse error', async () => {
  const res = await request('POST', '/mcp', '{not json', {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(jsonBody(res).error.code, -32700);
});

test('POST /mcp with a non-JSON-RPC body returns a JSON-RPC 400 error', async () => {
  const res = await request('POST', '/mcp', {foo: 'bar'}, {accept: 'application/json, text/event-stream'});
  assert.equal(res.statusCode, 400);
  assert.equal(jsonBody(res).error.code, -32700);
});

test('POST /mcp with a non-JSON content type returns a JSON-RPC 415 error', async () => {
  const res = await request('POST', '/mcp', 'x=1', {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json, text/event-stream'
  });
  assert.equal(res.statusCode, 415);
  assert.equal(jsonBody(res).error.code, -32000);
});

test('POST /mcp with an unknown JSON-RPC method returns a -32601 error', async () => {
  const res = await request('POST', '/mcp', {jsonrpc: '2.0', method: 'bogus/method', id: 9}, {
    accept: 'application/json, text/event-stream'
  });
  assert.equal(res.statusCode, 200);
  const dataLine = res.body.split('\n').find((line: string) => line.startsWith('data: '));
  assert.ok(dataLine);
  const message = JSON.parse(dataLine.slice(6));
  assert.equal(message.error.code, -32601);
});

test('POST /mcp with a valid initialize request returns server info via SSE', async () => {
  const res = await request('POST', '/mcp', {
    jsonrpc: '2.0',
    method: 'initialize',
    id: 1,
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {name: 'test-client', version: '1.0'}
    }
  }, {
    accept: 'application/json, text/event-stream'
  });
  assert.equal(res.statusCode, 200);
  const dataLine = res.body.split('\n').find((line: string) => line.startsWith('data: '));
  assert.ok(dataLine);
  const message = JSON.parse(dataLine.slice(6));
  assert.equal(message.result.serverInfo.name, 'Kilotest');
});

// TESTS: answer error branches

test('POST /requestTest.html with valid format but duplicate URL returns an answer error', {timeout: 500}, async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  // First request to create the request. processTestRequest treats a request as a
  // duplicate only when description, URL, AND reason all match an existing pending
  // request, so the reason must be identical between the two requests here.
  await formRequest('POST', '/requestTest.html', {
    description: `Dup Test Page ${uniqueStamp}`,
    url: `https://example.com/dup-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  // Second, identical request should get a duplicate error.
  const res = await formRequest('POST', '/requestTest.html', {
    description: `Dup Test Page ${uniqueStamp}`,
    url: `https://example.com/dup-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Test request duplicates an already submitted request'));
});

test('POST /requestRetest.html with valid format but duplicate retest returns an answer error', {timeout: 500}, async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  // First retest to create the recommendation. As above, the reason must match
  // exactly between the two requests for processTestRequest to treat the second as
  // a duplicate rather than a second, independent (and thus also 'ok') request.
  await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: 'Because the report is obsolete and needs refreshing'
  });
  // Second, identical retest of the same report should get a duplicate error.
  const res = await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: 'Because the report is obsolete and needs refreshing'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Test request duplicates an already submitted request'));
});

test('POST /requestAction.html with valid auth code approves the same target twice without error', {timeout: 500}, async () => {
  await fs.writeFile(testRequestsPath, '{}\n');
  // Create a request.
  await formRequest('POST', '/requestTest.html', {
    description: `Action Dup Page ${uniqueStamp}`,
    url: `https://example.com/action-dup-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  // Approve it once.
  await formRequest('POST', '/requestAction.html', {
    target: `https://example.com/action-dup-${uniqueStamp}\tAction Dup Page ${uniqueStamp}`,
    authCode: 'test-auth-code',
    what: 'yes'
  });
  // Approve it again. enqueue.answer has no duplicate-detection logic of its own (that
  // lives in processTestRequest, upstream of approval), so a second approval of the same
  // target queues a second job rather than erroring.
  const res = await formRequest('POST', '/requestAction.html', {
    target: `https://example.com/action-dup-${uniqueStamp}\tAction Dup Page ${uniqueStamp}`,
    authCode: 'test-auth-code',
    what: 'yes'
  });
  assert.equal(res.statusCode, 200);
});

test('POST /requestAction.html with valid auth code and approval of an invalid URL returns an error', async () => {
  // A URL that starts with https:// but is not a valid URL fails index.ts's own isURL check.
  const res = await formRequest('POST', '/requestAction.html', {
    target: 'https://\tTest Page',
    authCode: 'test-auth-code',
    what: 'yes'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
});

// UNIT TESTS FOR serveError

const mockRes = (): any => {
  const state: any = {statusCode: null, headers: {}, body: null, writableEnded: false};
  return {
    get statusCode() {return state.statusCode;},
    set statusCode(value: any) {state.statusCode = value;},
    setHeader(name: any, value: any) {state.headers[name] = value;},
    end(data: any) {state.body = data; state.writableEnded = true;},
    _state: state
  };
};

test('serveError does not write to a response that has already ended', async () => {
  let wrote = false;
  const mockResponse: any = {
    writableEnded: true,
    set statusCode(value: any) {
      wrote = true;
    },
    setHeader() {
      wrote = true;
    },
    end() {
      wrote = true;
    }
  };
  await serveError({message: 'test error'}, mockResponse);
  assert.equal(wrote, false);
});

test('serveError logs ERROR when the error object has no entries', async () => {
  const res = mockRes();
  await serveError({}, res, true);
  // The response should still be sent with the fallback message.
  assert.ok(res._state.body);
});

test('serveError uses ERROR fallback when error has no message property', async () => {
  const res = mockRes();
  await serveError({code: 500}, res, true);
  assert.ok(res._state.body.includes('ERROR'));
});

// UNIT TESTS FOR isPathAllowed

test('isPathAllowed returns false for a method with no routes', () => {
  assert.equal(isPathAllowed('DELETE', '/'), false);
});

// UNIT TESTS FOR getAbuseError

test('getAbuseError uses unknown IP when no forwarding header or remote address', () => {
  const mockRequest = {
    method: 'GET',
    url: '/suspicious',
    headers: {},
    socket: {remoteAddress: undefined}
  };
  const result = getAbuseError(mockRequest as any, 'test reason');
  assert.equal(result['IP address'], 'unknown');
  assert.equal(result.reason, 'test reason');
});

// TESTS FOR general per-request logging

test('a request logs a single-line JSON record with the expected fields', async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (line: string) => logged.push(line);
  try {
    await request('GET', '/listReports.html');
  }
  finally {
    console.log = originalLog;
  }
  const requestLines = logged.filter(line => {
    try {
      return JSON.parse(line).type === 'request';
    }
    catch {
      return false;
    }
  });
  assert.equal(requestLines.length, 1);
  const record = JSON.parse(requestLines[0]!);
  assert.equal(record.method, 'GET');
  assert.equal(record.path, '/listReports.html');
  assert.equal(record.status, 200);
  assert.ok(record.ip);
  assert.ok(record.userAgent);
  assert.ok(record.time);
});

test('a request logs its path without its query string', async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (line: string) => logged.push(line);
  try {
    await request('GET', '/listIssues.html/260101T0000/mix?authCode=secret');
  }
  finally {
    console.log = originalLog;
  }
  const record = logged
  .map(line => { try {return JSON.parse(line);} catch {return null;} })
  .find(parsed => parsed?.type === 'request');
  assert.ok(record);
  assert.equal(record.path, '/listIssues.html/260101T0000/mix');
  assert.ok(!JSON.stringify(record).includes('secret'));
});

test('a smoke-test-flagged request is not logged as a general request', async () => {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (line: string) => logged.push(line);
  try {
    await request('GET', '/listReports.html', null, {'x-kilotest-smoke': '1'});
  }
  finally {
    console.log = originalLog;
  }
  const requestLines = logged.filter(line => {
    try {
      return JSON.parse(line).type === 'request';
    }
    catch {
      return false;
    }
  });
  assert.equal(requestLines.length, 0);
});

// UNIT TESTS FOR startServer

test('startServer starts an HTTP server when protocol is http', {timeout: 500}, async () => {
  // Delete PROTOCOL to exercise the 'http' fallback in startServer.
  const savedProtocol = process.env.PROTOCOL;
  // Use port 0 so the OS assigns an ephemeral port, avoiding collisions with production.
  const savedPort = process.env.PORT;
  process.env.PORT = '0';
  delete process.env.PROTOCOL;
  const server = await startServer();
  process.env.PROTOCOL = savedProtocol;
  if (savedPort !== undefined) {
    process.env.PORT = savedPort;
  }
  else {
    delete process.env.PORT;
  }
  try {
    assert.ok(server);
    assert.equal(typeof server.listen, 'function');
    // Verify the server is listening by making a request.
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null && address.port > 0);
  }
  finally {
    server?.closeAllConnections?.();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        server?.closeAllConnections?.();
        resolve();
      }, 1000);
      server?.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
});

test('serve uses the default port 3000 when PORT is not set', {timeout: 500}, async () => {
  // Exercise the '|| 3000' fallback branch in serve by deleting PORT and calling
  // serve directly. The server will attempt to bind to port 3000. On a system
  // where port 3000 is free, it succeeds and we close it. Where it is occupied,
  // the error event fires and we accept that as proof the fallback was reached.
  const savedPort = process.env.PORT;
  delete process.env.PORT;
  try {
    const server = await indexModule.serve(http, {});
    let bindError: any = null;
    server.on('error', error => {
      bindError = error;
    });
    // Wait briefly for either successful binding or an EADDRINUSE error.
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 200);
      server.on('listening', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (bindError) {
      assert.equal(bindError.code, 'EADDRINUSE', `Expected EADDRINUSE, got: ${bindError.message}`);
    }
    else {
      const address = server.address();
      assert.ok(typeof address === 'object' && address !== null && address.port === 3000);
    }
    server.closeAllConnections?.();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 1000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  finally {
    if (savedPort !== undefined) {
      process.env.PORT = savedPort;
    }
    else {
      delete process.env.PORT;
    }
  }
});

test('startServer starts an HTTPS server when protocol is https', {timeout: 2000}, async () => {
  // Generate a self-signed certificate for the test using openssl.
  const {execSync} = await import('node:child_process');
  const os = await import('node:os');
  const fsSync = await import('node:fs');
  const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'kilotest-https-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');
  // Generate a self-signed certificate valid for 1 day.
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=localhost"`,
    {stdio: 'pipe'}
  );
  const savedProtocol = process.env.PROTOCOL;
  const savedKey = process.env.KEY;
  const savedCert = process.env.CERT;
  // Use port 0 so the OS assigns an ephemeral port, avoiding collisions with production.
  const savedPort = process.env.PORT;
  process.env.PORT = '0';
  process.env.PROTOCOL = 'https';
  process.env.KEY = keyPath;
  process.env.CERT = certPath;
  try {
    const server = await startServer();
    assert.ok(server);
    assert.equal(typeof server.listen, 'function');
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null && address.port > 0);
    server.closeAllConnections?.();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 1000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  finally {
    if (savedProtocol !== undefined) {
      process.env.PROTOCOL = savedProtocol;
    }
    else {
      delete process.env.PROTOCOL;
    }
    if (savedKey !== undefined) {
      process.env.KEY = savedKey;
    }
    else {
      delete process.env.KEY;
    }
    if (savedCert !== undefined) {
      process.env.CERT = savedCert;
    }
    else {
      delete process.env.CERT;
    }
    if (savedPort !== undefined) {
      process.env.PORT = savedPort;
    }
    else {
      delete process.env.PORT;
    }
    fsSync.rmSync(tmpDir, {recursive: true, force: true});
  }
});

test('runIfMain calls startServer when mainModule matches currentModule', async () => {
  let called = false;
  const starter = async () => {
    called = true;
    return null;
  };
  // Pass the same object for both arguments so the guard is true.
  const fakeModule = {};
  runIfMain(fakeModule, fakeModule, starter);
  // Wait for the microtask queue to flush the promise.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(called, true);
});

test('runIfMain does not call startServer when mainModule differs from currentModule', async () => {
  let called = false;
  const starter = async () => {
    called = true;
    return null;
  };
  runIfMain({}, {}, starter);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(called, false);
});
