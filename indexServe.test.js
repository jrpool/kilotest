/*
  indexServe.test.js
  Tests for the serve function in index.js, which starts the HTTP or HTTPS
  server. The serve function is exported for testing.

  This file uses a temporary copy of the fixture database to avoid interfering
  with other test files that run concurrently and share the same fixture directory.
*/

// IMPORTS (needed before setting DB_DIR)

const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');

// ENVIRONMENT (must be set before requiring index.js)

// Copy the fixture database to a temporary directory so this file does not
// interfere with other test files that use the shared fixture directory.
const tempDBDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'kilotest-srv-'));
const sourceDBDir = path.join(__dirname, 'test', 'fixtures', 'db');
fsSync.cpSync(sourceDBDir, tempDBDir, {recursive: true});

process.env.DB_DIR = tempDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = '{}';

const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {serve} = require('./index');

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

// TEARDOWN

after(async () => {
  await fs.rm(tempDBDir, {recursive: true, force: true});
});

// TESTS

test('serve creates missing directories and returns an HTTP server', async () => {
  // Remove the queue directory to verify serve recreates it.
  const queueDir = path.join(tempDBDir, 'jobs', 'queue');
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
