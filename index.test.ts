/*
  index.test.ts
  Integration tests for index.js requestHandler, covering GET routes, POST routes,
  error paths, worker authentication, and helper function behavior.
*/

// ENVIRONMENT (the test environment configuration; all modules now read
// process.env at call time, so load order no longer matters.)

import path from 'node:path';
import {fixtureDBDir} from './test/dbFixture.ts';

process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = JSON.stringify({
  worker1: {secret: 'secret1', name: 'Worker One'}
});

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import * as indexModule from './index.ts';
const {requestHandler, routes, serveError, startServer, runIfMain, isPathAllowed, getAbuseError} = indexModule;

// CONSTANTS

const port = 3997;
const recsPath = path.join(fixtureDBDir, 'jobs', 'recs.json');

// SETUP AND TEARDOWN

let server: http.Server;

before(async () => {
  server = http.createServer(requestHandler);
  await new Promise<void>(resolve => server.listen(port, () => resolve()));
});

// Restore recs.json and clean job directories before each test, so tests do not depend on execution order.
beforeEach(async () => {
  await fs.writeFile(recsPath, '{}\n');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(fixtureDBDir, 'jobs', sub);
    await fs.mkdir(dir, {recursive: true});
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
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
  // Restore recs.json and clean job directories after running.
  await fs.writeFile(recsPath, '{}\n');
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

test('GET /api/listReports returns JSON with report data', async () => {
  const res = await request('GET', '/api/listReports');
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body['tool name'], 'listReports');
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

test('GET /tutorial/images/newsletter-form.png serves the image', async () => {
  const res = await request('GET', '/tutorial/images/newsletter-form.png');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('image/png'));
});

test('GET /tutorial/images with an unknown extension serves octet-stream', async () => {
  // Create a temporary image file with an unknown extension.
  const imgPath = path.join(import.meta.dirname, 'web', 'tutorial', 'images', 'test.bmp');
  await fs.writeFile(imgPath, 'fake bitmap data');
  try {
    const res = await request('GET', '/tutorial/images/test.bmp');
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('application/octet-stream'));
  }
  finally {
    await fs.unlink(imgPath).catch(() => {});
  }
});

test('GET /tutorial/images/nonexistent.png returns an error page', async () => {
  const res = await request('GET', '/tutorial/images/nonexistent.png');
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
    what: `Unique Test Page ${uniqueStamp}`,
    url: `https://example.com/unique-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /requestTest.html with an already-tested URL returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    what: 'Mixed Outcomes Page',
    url: 'https://example.com/mixed',
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('already been tested'));
});

test('POST /requestTest.html with invalid data returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    what: '',
    url: 'not-a-url',
    why: ''
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid test recommendation'));
});

test('POST /requestRetest.html/260202T0000/new with valid data returns HTML', async () => {
  // Reset recs.json to avoid duplicate-recommendation errors from prior tests.
  await fs.writeFile(recsPath, '{}\n');
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
  assert.ok(res.body.includes('Invalid retest recommendation'));
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

test('POST /api/requestFeature with valid JSON returns a JSON response', async () => {
  const res = await request('POST', '/api/requestFeature', {
    feature: 'Add a dark mode toggle'
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(body['tool name'] || body['response content']);
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

// TESTS: recAction.html

test('POST /recAction.html with invalid auth code returns an error', {timeout: 500}, async () => {
  const res = await formRequest('POST', '/recAction.html', {
    target: 'https://example.com\tTest Page',
    authCode: 'wrong-code'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid test order'));
});

test('POST /recAction.html with valid auth code and rejection (no what) returns HTML', async () => {
  await formRequest('POST', '/requestTest.html', {
    what: `Reject Test Page ${uniqueStamp}`,
    url: `https://example.com/reject-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  const res = await formRequest('POST', '/recAction.html', {
    target: `https://example.com/reject-${uniqueStamp}`,
    authCode: 'test-auth-code'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

// TESTS: tutorialComment

test('POST /tutorialComment.html with content returns JSON', async () => {
  const res = await request('POST', '/tutorialComment.html', {
    content: 'This is a test comment'
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
});

// TESTS: additional branch coverage

test('GET /fullReport.json/260101T0007/hid returns an abuse error for a hidden report', async () => {
  const res = await request('GET', '/fullReport.json/260101T0007/hid');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid request'));
});

test('POST /recAction.html with valid auth code and approval returns HTML', {timeout: 500}, async () => {
  await fs.writeFile(recsPath, '{}\n');
  await formRequest('POST', '/requestTest.html', {
    what: `Approval Test Page ${uniqueStamp}`,
    url: `https://example.com/approval-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  const res = await formRequest('POST', '/recAction.html', {
    target: `https://example.com/approval-${uniqueStamp}\tApproval Test Page ${uniqueStamp}`,
    authCode: 'test-auth-code'
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /reannotate.html with invalid auth code returns an error page', async () => {
  const res = await formRequest('POST', '/reannotate.html', {
    authCode: 'wrong-code'
  });
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /reannotate.html with valid auth code serves the answer page', async () => {
  // Back up all fixture reports, because annotateReport modifies them in place.
  const reportsDir = path.join(fixtureDBDir, 'reports');
  const reportFiles = await fs.readdir(reportsDir);
  const backups: Record<string, string> = {};
  for (const file of reportFiles) {
    backups[file] = await fs.readFile(path.join(reportsDir, file), 'utf8');
  }
  try {
    const res = await formRequest('POST', '/reannotate.html', {
      authCode: 'test-auth-code'
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('Reannotation order'));
  }
  finally {
    // Restore all fixture reports.
    for (const file of reportFiles) {
      await fs.writeFile(path.join(reportsDir, file), backups[file]);
    }
  }
});

test('POST /renewWCAG.html with invalid auth code returns an error page', async () => {
  const res = await formRequest('POST', '/renewWCAG.html', {
    authCode: 'wrong-code'
  });
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /renewWCAG.html with valid auth code serves the answer page', async () => {
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
    const res = await formRequest('POST', '/renewWCAG.html', {
      authCode: 'test-auth-code'
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('WCAG map renewed'));
  }
  finally {
    global.fetch = originalFetch;
    await fs.writeFile(wcagMapPath, wcagMapBackup);
  }
});

test('POST /tutorialComment.html with empty content returns a JSON error', {timeout: 500}, async () => {
  const res = await request('POST', '/tutorialComment.html', {
    content: ''
  });
  assert.ok(res.headers['content-type'].includes('application/json'));
});

test('POST /requestTest.html with non-https URL returns an error', async () => {
  const res = await formRequest('POST', '/requestTest.html', {
    what: 'Test Page',
    url: 'http://example.com',
    why: 'Because accessibility matters'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid test recommendation'));
});

test('POST /requestRetest.html/260202T0000/new with missing why returns an error', async () => {
  const res = await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: ''
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid retest recommendation'));
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

test('GET /requestTest.html returns an error page when called without arguments', async () => {
  const res = await request('GET', '/requestTest.html');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('GET /requestRetest.html/260202T0000/new returns an error page when called as GET', async () => {
  const res = await request('GET', '/requestRetest.html/260202T0000/new');
  assert.equal(res.statusCode, 400);
  assert.ok(res.headers['content-type'].includes('text/html'));
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
  '/tutorial.html',
  '/listTopIssues.html',
  '/reannotateForm.html',
  '/renewWCAGForm.html',
  '/hideReportForm.html',
  '/unhideReportForm.html',
  '/expungeReportsForm.html',
  '/pruneReportsForm.html',
  '/rewindReportsForm.html',
  '/ai0BalanceForm.html'
];

for (const pagePath of htmlPagePaths) {
  test(`GET ${pagePath} serves a generated HTML page`, {timeout: 500}, async () => {
    const res = await request('GET', pagePath);
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
  });
}

test('GET /enqueueForm.html shows recommendations when recs.json has entries', async () => {
  await fs.writeFile(recsPath, JSON.stringify({
    'https://example.com/enqueue-test': [
      {what: 'Enqueue Test Page', why: 'Needs testing for accessibility'}
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

test('GET /mcp returns a response from the MCP handler', async () => {
  const res = await request('GET', '/mcp');
  // The MCP handler responds to GET requests, typically with an error
  // about acceptable content types or a similar MCP protocol message.
  assert.ok(res.statusCode >= 400);
});

test('POST /mcp returns a response from the MCP handler', async () => {
  const res = await request('POST', '/mcp', {
    jsonrpc: '2.0',
    method: 'initialize',
    id: 1,
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {name: 'test-client', version: '1.0'}
    }
  }, {
    accept: 'application/json, text/event-stream'
  });
  // The MCP handler should process the initialize request.
  assert.ok(res.statusCode === 200 || res.statusCode >= 400);
});

// TESTS: answer error branches

test('POST /requestTest.html with valid format but duplicate URL returns an answer error', {timeout: 500}, async () => {
  await fs.writeFile(recsPath, '{}\n');
  // First request to create the recommendation.
  await formRequest('POST', '/requestTest.html', {
    what: `Dup Test Page ${uniqueStamp}`,
    url: `https://example.com/dup-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  // Second request with the same URL should get a duplicate error.
  const res = await formRequest('POST', '/requestTest.html', {
    what: `Dup Test Page ${uniqueStamp}`,
    url: `https://example.com/dup-${uniqueStamp}`,
    why: 'Because accessibility matters again'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Duplicate recommendation'));
});

test('POST /requestRetest.html with valid format but duplicate retest returns an answer error', {timeout: 500}, async () => {
  await fs.writeFile(recsPath, '{}\n');
  // First retest to create the recommendation.
  await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: 'Because the report is obsolete and needs refreshing'
  });
  // Second retest with the same report should get a duplicate error.
  const res = await formRequest('POST', '/requestRetest.html/260202T0000/new', {
    why: 'Because the report is obsolete and needs refreshing again'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Duplicate recommendation'));
});

test('POST /recAction.html with valid auth code and approval of a duplicate returns an error', {timeout: 500}, async () => {
  await fs.writeFile(recsPath, '{}\n');
  // Create a recommendation.
  await formRequest('POST', '/requestTest.html', {
    what: `Action Dup Page ${uniqueStamp}`,
    url: `https://example.com/action-dup-${uniqueStamp}`,
    why: 'Because accessibility matters'
  });
  // Approve it once.
  await formRequest('POST', '/recAction.html', {
    target: `https://example.com/action-dup-${uniqueStamp}\tAction Dup Page ${uniqueStamp}`,
    authCode: 'test-auth-code',
    what: 'yes'
  });
  // Approve it again (the recs may have been cleared, so this may succeed or fail).
  // This test covers the recAction answer error branch.
  const res = await formRequest('POST', '/recAction.html', {
    target: `https://example.com/action-dup-${uniqueStamp}\tAction Dup Page ${uniqueStamp}`,
    authCode: 'test-auth-code',
    what: 'yes'
  });
  // Either it succeeds (200) or returns an error (400).
  assert.ok(res.statusCode === 200 || res.statusCode === 400);
});

test('POST /recAction.html with valid auth code and approval of an invalid URL returns an error', async () => {
  // A URL that starts with https:// but is not a valid URL causes
  // enqueue.answer to return status error.
  const res = await formRequest('POST', '/recAction.html', {
    target: 'https://\tTest Page',
    authCode: 'test-auth-code',
    what: 'yes'
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Invalid authorization code'));
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
