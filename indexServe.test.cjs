/*
  indexServe.test.cjs
  Tests for the serve function in index.js, which starts the HTTP or HTTPS
  server. The serve function is exported for testing.
*/

// ENVIRONMENT (must be set before requiring index.js)

const path = require('node:path');
const fixtureDBDir = require('./test/dbFixture.ts').fixtureDBDir;

process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = '{}';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const {serve} = require('./index.ts');

// HELPER

const closeServer = server => new Promise(resolve => {
  if (!server) {
    resolve();
    return;
  }
  // Close all idle connections, then close the server.
  server.closeAllConnections?.();
  const timer = setTimeout(() => {
    server.closeAllConnections?.();
    resolve();
  }, 500);
  server.close(() => {
    clearTimeout(timer);
    resolve();
  });
});

// TESTS

test('serve creates missing directories and returns an HTTP server', async () => {
  // Remove the queue directory to verify serve recreates it.
  const queueDir = path.join(fixtureDBDir, 'jobs', 'queue');
  await fs.rm(queueDir, {recursive: true}).catch(() => {});
  process.env.PORT = '3987';
  const server = await serve(http, {});
  try {
    assert.ok(server);
    assert.equal(typeof server.listen, 'function');
    // Verify the queue directory was recreated.
    const exists = await fs.access(queueDir).then(() => true).catch(() => false);
    assert.ok(exists, 'serve should create the queue directory');
  }
  finally {
    await closeServer(server);
  }
});
