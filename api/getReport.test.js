/*
  getReport.test.js
  Tests for api/getReport.js using the fixture corpus.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {response} = require('./getReport');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'db');
});

after(() => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('getReport returns the full report for a valid report', async () => {
  const body = await response(['260101T0000', 'mix']);
  const content = body['response content'];
  assert.equal(typeof content['size of the report in bytes'], 'number');
  assert.ok(content['size of the report in bytes'] > 0);
  const report = content['full report'];
  assert.equal(report.id, '260101T0000-mix');
  assert.equal(report.target.what, 'Mixed Outcomes Page');
  assert.equal(report.target.url, 'https://example.com/mixed');
  assert.equal(report.acts.length, 2);
});

test('getReport returns an error for a nonexistent report', async () => {
  const body = await response(['999999T9999', 'xyz']);
  const content = body['response content'];
  assert.equal(content['full report'], null);
  assert.equal(typeof content['size of the report in bytes'], 'string');
});

test('getReport returns an error for the hidden report', async () => {
  const body = await response(['260101T0007', 'hid']);
  const content = body['response content'];
  assert.equal(content['full report'], null);
  assert.equal(typeof content['size of the report in bytes'], 'string');
});

test('getReport includes tool name and metadata', async () => {
  const body = await response(['260101T0000', 'mix']);
  assert.equal(body['tool name'], 'getReport');
  assert.ok(body['response metadata'].identifier);
});
