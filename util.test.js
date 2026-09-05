/*
  util.test.js
  Tests for util.js data-path injection (Phase 1).
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  dbPath,
  jobsPath,
  recsPath,
  reportsPath,
  hiddenReportsPath
} = require('./util');

// TESTS

test('dbPath defaults to the project db directory when DB_DIR is unset', () => {
  const saved = process.env.DB_DIR;
  delete process.env.DB_DIR;
  try {
    assert.equal(dbPath(), path.join(__dirname, 'db'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
  }
});

test('dbPath honors DB_DIR when it is set', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(dbPath(), '/tmp/kilotest-fixtures');
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});

test('jobsPath, recsPath, reportsPath, and hiddenReportsPath derive from DB_DIR', () => {
  const saved = process.env.DB_DIR;
  process.env.DB_DIR = '/tmp/kilotest-fixtures';
  try {
    assert.equal(jobsPath(), path.join('/tmp/kilotest-fixtures', 'jobs'));
    assert.equal(recsPath(), path.join('/tmp/kilotest-fixtures', 'jobs', 'recs.json'));
    assert.equal(reportsPath(), path.join('/tmp/kilotest-fixtures', 'reports'));
    assert.equal(hiddenReportsPath(), path.join('/tmp/kilotest-fixtures', 'hiddenReports'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});

test('changing DB_DIR between calls is reflected by the path functions', () => {
  const saved = process.env.DB_DIR;
  try {
    process.env.DB_DIR = '/tmp/a';
    assert.equal(reportsPath(), path.join('/tmp/a', 'reports'));
    process.env.DB_DIR = '/tmp/b';
    assert.equal(reportsPath(), path.join('/tmp/b', 'reports'));
  }
  finally {
    if (saved !== undefined) {
      process.env.DB_DIR = saved;
    }
    else {
      delete process.env.DB_DIR;
    }
  }
});
