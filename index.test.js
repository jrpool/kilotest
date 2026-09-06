/*
  index.test.js
  Integration tests for index.js requestHandler, covering GET routes, POST routes,
  error paths, worker authentication, and helper function behavior.
*/

// ENVIRONMENT (must be set before requiring index.js, because index.js reads
// TESTARO_WORKERS and AUTH_CODE at module load time, and util.js reads DB_DIR.)

process.env.DB_DIR = require('node:path').join(__dirname, 'test', 'fixtures', 'db');
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = JSON.stringify({
  worker1: {secret: 'secret1', name: 'Worker One'}
});

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs/promises');
const {requestHandler, routes} = require('./index');

// CONSTANTS

const port = 3997;
const uniqueStamp = Date.now();
const recsPath = path.join(__dirname, 'test', 'fixtures', 'db', 'jobs', 'recs.json');

// SETUP AND TEARDOWN

let server;

before(async () => {
  server = http.createServer(requestHandler);
  await new Promise(resolve => server.listen(port, resolve));
});

after(async () => {
  await new Promise(resolve => server.close(() => resolve()));
  // Restore recs.json to empty to prevent duplicate-recommendation errors in future runs.
  await fs.writeFile(recsPath, '{}\n');
  // Clean up any jobs created by tests.
  const jobsDir = path.join(__dirname, 'test', 'fixtures', 'db', 'jobs');
  for (const sub of ['claimed', 'queue', 'failed']) {
    const dir = path.join(jobsDir, sub);
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }
});

// HELPERS

const request = (method, requestPath, body = null, headers = {}) => new Promise((resolve, reject) => {
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
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()});
    });
  });
  req.on('error', reject);
  req.end(bodyData || '');
});

const formRequest = (method, requestPath, formData, headers = {}) => new Promise((resolve, reject) => {
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
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()});
    });
  });
  req.on('error', reject);
  req.end(body);
});

const jsonBody = res => {
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

test('GET /api/listDiagnoses/0/linkNoText/260101T0000/mix returns JSON', async () => {
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

test('GET /api/invalidService returns an error', async () => {
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

test('GET /fullReport.json/invalid/invalid returns an error page', async () => {
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

test('GET /tutorial/images/nonexistent.png returns an error page', async () => {
  const res = await request('GET', '/tutorial/images/nonexistent.png');
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.includes('Image not found'));
});

test('GET /listReports.html serves a generated HTML page', async () => {
  const res = await request('GET', '/listReports.html');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('GET /nonexistent.html returns an abuse error', async () => {
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

test('POST /api/requestTest with valid JSON returns a JSON response', async () => {
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

test('POST /worker/job with valid authentication returns a job or no-job response', async () => {
  // Clean up any claimed jobs left by prior tests.
  const claimedDir = path.join(__dirname, 'test', 'fixtures', 'db', 'jobs', 'claimed');
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

test('POST /recAction.html with invalid auth code returns an error', async () => {
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

// TESTS: reannotate and renewWCAG

test('POST /renewWCAG.html with valid auth code returns HTML', async () => {
  const res = await formRequest('POST', '/renewWCAG.html', {
    authCode: 'test-auth-code'
  });
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

test('GET /listViolators.html/linkNoText/260101T0000/mix serves a generated HTML page', async () => {
  const res = await request('GET', '/listViolators.html/linkNoText/260101T0000/mix');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('GET /listDiagnoses.html/linkNoText/260101T0000/mix/0 serves a generated HTML page', async () => {
  const res = await request('GET', '/listDiagnoses.html/linkNoText/260101T0000/mix/0');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /recAction.html with valid auth code and approval returns HTML', async () => {
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

test('POST /renewWCAG.html with invalid auth code returns an error page', async () => {
  const res = await formRequest('POST', '/renewWCAG.html', {
    authCode: 'wrong-code'
  });
  assert.ok(res.headers['content-type'].includes('text/html'));
});

test('POST /tutorialComment.html with empty content returns a JSON error', async () => {
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
