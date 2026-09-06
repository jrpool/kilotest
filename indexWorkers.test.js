/*
  indexWorkers.test.js
  Tests for index.js when TESTARO_WORKERS is invalid JSON.
  This must be a separate file because index.js reads TESTARO_WORKERS
  at module load time.
*/

// ENVIRONMENT (must be set before requiring index.js)

process.env.DB_DIR = require('node:path').join(__dirname, 'test', 'fixtures', 'db');
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = 'not valid json';

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {requestHandler} = require('./index');

// CONSTANTS

const port = 3993;

// HELPERS

const request = (method, requestPath, body = null, headers = {}) => new Promise((resolve, reject) => {
  const options = {method, host: 'localhost', port, path: requestPath, headers: {...headers}};
  let bodyData = '';
  if (body) {
    bodyData = JSON.stringify(body);
    options.headers['content-type'] = 'application/json';
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

// TESTS

test('index.js loads with invalid TESTARO_WORKERS and treats workers as empty', () => {
  // If index.js loaded successfully, requestHandler is a function.
  assert.equal(typeof requestHandler, 'function');
});

test('POST /worker/job with invalid TESTARO_WORKERS returns 401 for any credentials', async () => {
  const server = http.createServer(requestHandler);
  await new Promise(resolve => server.listen(port, () => resolve()));
  try {
    const auth = Buffer.from('worker1:secret1').toString('base64');
    const res = await request('POST', '/worker/job', {}, {
      authorization: `Basic ${auth}`
    });
    assert.equal(res.statusCode, 401);
  }
  finally {
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
  }
});
