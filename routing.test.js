/*
  routing.test.js
  Integration tests for HTTP routing in index.js, verifying that POST-only
  API services reject GET requests.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const {requestHandler} = require('./index');

// CONSTANTS

const port = 3999;

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
let server;

before(async () => {
  process.env.DB_DIR = path.join(__dirname, 'test', 'fixtures', 'db');
  server = http.createServer(requestHandler);
  await new Promise(resolve => server.listen(port, resolve));
});

after(async () => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
  await new Promise(resolve => server.close(() => resolve()));
});

// HELPERS

// Sends a GET request and returns the response body as a string.
const get = requestPath => new Promise((resolve, reject) => {
  http.request({method: 'GET', host: 'localhost', port, path: requestPath}, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      resolve({statusCode: response.statusCode, body: chunks.join('')});
    });
  })
  .on('error', reject)
  .end();
});

// TESTS

test('GET /api/requestTest returns an error, not a test-request response', async () => {
  const result = await get('/api/requestTest');
  assert.ok(result.body.includes('Invalid service request'));
});

test('GET /api/requestRetest returns an error, not a retest-request response', async () => {
  const result = await get('/api/requestRetest/260101T0001/ct');
  assert.ok(result.body.includes('Invalid service request'));
});

test('GET /api/requestFeature returns an error, not a feature-request response', async () => {
  const result = await get('/api/requestFeature');
  assert.ok(result.body.includes('Invalid service request'));
});

test('GET /api/listReports returns a valid JSON response', async () => {
  const result = await get('/api/listReports');
  const body = JSON.parse(result.body);
  assert.equal(body['tool name'], 'listReports');
  const reports = body['response content']['basics about all available reports'];
  assert.equal(reports.length, 6);
});
