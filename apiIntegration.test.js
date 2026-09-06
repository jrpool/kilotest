/*
  apiIntegration.test.js
  Deterministic HTTP integration tests for all API endpoints, using the fixture corpus and a temporary in-process server.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const {requestHandler} = require('./index');

// CONSTANTS

const port = 3998;

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

// Sends an HTTP request and returns the parsed JSON response body.
const request = (method, requestPath, body = null) => new Promise((resolve, reject) => {
  const options = {method, host: 'localhost', port, path: requestPath};
  if (body) {
    const bodyJSON = JSON.stringify(body);
    options.headers = {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(bodyJSON)
    };
  }
  const req = http.request(options, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      const bodyString = chunks.join('');
      try {
        resolve({statusCode: response.statusCode, body: JSON.parse(bodyString)});
      }
      catch {
        resolve({statusCode: response.statusCode, body: bodyString});
      }
    });
  });
  req.on('error', reject);
  req.end(body ? JSON.stringify(body) : '');
});

// TESTS: GET ENDPOINTS

test('GET /api/listReports returns 6 non-hidden reports', async () => {
  const {body} = await request('GET', '/api/listReports');
  assert.equal(body['tool name'], 'listReports');
  const reports = body['response content']['basics about all available reports'];
  assert.equal(reports.length, 6);
});

test('GET /api/listIssues/260101T0000/mix returns 2 issues excluding cantTell', async () => {
  const {body} = await request('GET', '/api/listIssues/260101T0000/mix');
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 2);
});

test('GET /api/listIssues/260101T0001/ct returns 0 issues for all-cantTell report', async () => {
  const {body} = await request('GET', '/api/listIssues/260101T0001/ct');
  const issues = body['response content']['basics about all issues reported in the report'];
  assert.equal(issues.length, 0);
});

test('GET /api/listIssues/999999T9999/xyz returns an error for a nonexistent report', async () => {
  const {body} = await request('GET', '/api/listIssues/999999T9999/xyz');
  const basics = body['response content']['basics about the report'];
  assert.ok(basics.error);
});

test('GET /api/listViolators/linkNoText/260101T0000/mix returns 1 violator excluding cantTell', async () => {
  const {body} = await request('GET', '/api/listViolators/linkNoText/260101T0000/mix');
  const violators = body['response content']['basics about all elements exhibiting the issue'];
  assert.equal(violators.length, 1);
  assert.equal(violators[0]['count of rule engines reporting that the element exhibited the issue'], 2);
});

test('GET /api/listDiagnoses/0/linkNoText/260101T0000/mix returns 2 diagnoses excluding cantTell', async () => {
  const {body} = await request('GET', '/api/listDiagnoses/0/linkNoText/260101T0000/mix');
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'];
  assert.equal(diagnoses.length, 2);
});

test('GET /api/getReport/260101T0000/mix returns the full report', async () => {
  const {body} = await request('GET', '/api/getReport/260101T0000/mix');
  const content = body['response content'];
  assert.equal(typeof content['size of the report in bytes'], 'number');
  assert.equal(content['full report'].id, '260101T0000-mix');
});

test('GET /api/getReport/999999T9999/xyz returns an error for a nonexistent report', async () => {
  const {body} = await request('GET', '/api/getReport/999999T9999/xyz');
  const content = body['response content'];
  assert.equal(content['full report'], null);
  assert.equal(typeof content['size of the report in bytes'], 'string');
});

// TESTS: POST ENDPOINTS

test('POST /api/requestTest with a too-short URL returns a URL error', async () => {
  const {body} = await request('POST', '/api/requestTest', {description: 'Test Page', URL: 'short', reason: 'A reason that is long enough.'});
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('URL'));
});

test('POST /api/requestTest with an already-tested page returns an error', async () => {
  const {body} = await request('POST', '/api/requestTest', {description: 'Mixed Outcomes Page', URL: 'https://example.com/mixed', reason: 'A reason that is long enough.'});
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('already been tested'));
});

test('POST /api/requestRetest for a nonexistent report returns an error', async () => {
  const {body} = await request('POST', '/api/requestRetest/999999T9999/xyz', {reason: 'A reason that is long enough.'});
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('not an available report'));
});

test('POST /api/requestRetest for a superseded report returns an error', async () => {
  const {body} = await request('POST', '/api/requestRetest/260101T0000/mix', {reason: 'A reason that is long enough.'});
  const details = body['response content']['details about your request'];
  assert.ok(details.error.includes('later report'));
});

test('POST /api/requestFeature with a valid feature returns a disposition', async () => {
  const {body} = await request('POST', '/api/requestFeature', {feature: 'Add a dark mode toggle'});
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details.disposition, 'received and logged; manager notified');
});

test('POST /api/requestFeature with an empty feature returns an error', async () => {
  const {body} = await request('POST', '/api/requestFeature', {feature: ''});
  const details = body['response content']['details about your request'];
  assert.ok(details.error);
});
