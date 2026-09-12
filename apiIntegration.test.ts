// Not yet under strict type checking (transitional).
// @ts-nocheck
/*
  apiIntegration.test.ts
  Minimal HTTP integration tests verifying routing, body parsing, and JSON serialization, using the fixture corpus and a temporary in-process server.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {requestHandler} from './index.ts';

// CONSTANTS

const port = 3998;

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
let server;

before(async () => {
  process.env.DB_DIR = (await import('./test/dbFixture.ts')).fixtureDBDir;
  server = http.createServer(requestHandler);
  await new Promise(resolve => server.listen(port, () => resolve()));
});

after(async () => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
  server.closeAllConnections?.();
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, 1000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
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

// TESTS

test('GET /api/listReports returns valid JSON through the HTTP routing layer', {timeout: 500}, async () => {
  const {body} = await request('GET', '/api/listReports');
  assert.equal(body['tool name'], 'listReports');
  const reports = body['response content']['basics about all available reports'];
  assert.equal(reports.length, 8);
});

test('POST /api/requestFeature parses a JSON body and returns a JSON response through the HTTP routing layer', async () => {
  const {body} = await request('POST', '/api/requestFeature', {feature: 'Add a dark mode toggle'});
  const details = body['response content']['details about your request'];
  assert.equal(details.error, undefined);
  assert.equal(details.disposition, 'received and logged; manager notified');
});
