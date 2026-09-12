/*
  indexServe.test.ts
  Tests for the serve function in index.js, which starts the HTTP or HTTPS
  server. The serve function is exported for testing.
*/

// ENVIRONMENT (must be set before requiring index.js)

import path from 'node:path';
import {fixtureDBDir} from './test/dbFixture.ts';

process.env.DB_DIR = fixtureDBDir;
process.env.AUTH_CODE = 'test-auth-code';
process.env.TESTARO_WORKERS = '{}';

import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {serve} from './index.ts';

// HELPER

const closeServer = (server: any) => new Promise<void>(resolve => {
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
