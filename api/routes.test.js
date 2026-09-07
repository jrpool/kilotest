/*
  routes.test.js
  Tests for api/routes.js, verifying the structure and completeness of the OpenAPI route metadata.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const routes = require('./routes');

// TESTS

test('routes exports an array with 8 operations', () => {
  assert.ok(Array.isArray(routes));
  assert.equal(routes.length, 8);
});

test('routes includes all expected operation IDs', () => {
  const ids = routes.map(r => r.operationId).sort();
  assert.deepEqual(ids, [
    'getReport',
    'listDiagnoses',
    'listIssues',
    'listReports',
    'listViolators',
    'requestFeature',
    'requestRetest',
    'requestTest'
  ]);
});

test('every route has a method, path, summary, and responseSchema', () => {
  for (const route of routes) {
    assert.ok(route.operationId, `route missing operationId: ${JSON.stringify(route)}`);
    assert.ok(route.method, `route ${route.operationId} missing method`);
    assert.ok(route.path, `route ${route.operationId} missing path`);
    assert.ok(route.summary, `route ${route.operationId} missing summary`);
    assert.ok(route.responseSchema, `route ${route.operationId} missing responseSchema`);
  }
});

test('GET routes have pathParamsSchema when the path has parameters', () => {
  for (const route of routes) {
    if (route.method === 'get' && route.path.includes('{')) {
      assert.ok(route.pathParamsSchema, `route ${route.operationId} missing pathParamsSchema`);
    }
  }
});

test('POST routes have bodySchema', () => {
  for (const route of routes) {
    if (route.method === 'post') {
      assert.ok(route.bodySchema, `route ${route.operationId} missing bodySchema`);
    }
  }
});

test('route paths start with /api/', () => {
  for (const route of routes) {
    assert.ok(route.path.startsWith('/api/'), `route ${route.operationId} path does not start with /api/`);
  }
});
