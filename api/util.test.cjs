/*
  util.test.cjs
  Tests for api/util.ts.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {getReportBasics, getResponseMetadata, getRuleEngineFacts, getRuleEnginesFacts, getIssueSpec, getToolsFacts, processTestRequest} = require('./util.ts');

// SETUP

const savedDBDir = process.env.DB_DIR;

test('getRuleEngineFacts returns the name and sponsor of a known rule engine', () => {
  const facts = getRuleEngineFacts('axe');
  assert.deepEqual(facts, {
    identifier: 'axe',
    name: 'Axe',
    sponsor: 'Deque'
  });
});

test('getRuleEngineFacts returns nulls for name and sponsor of an unknown rule engine', () => {
  const facts = getRuleEngineFacts('nonexistentEngine');
  assert.deepEqual(facts, {
    identifier: 'nonexistentEngine',
    name: null,
    sponsor: null
  });
});

test('getRuleEnginesFacts returns facts sorted alphabetically by name', () => {
  // Names: ibm -> "Accessibility Checker", axe -> "Axe", wave -> "WAVE".
  const facts = getRuleEnginesFacts(new Set(['wave', 'axe', 'ibm']));
  assert.deepEqual(facts.map(fact => fact.identifier), ['ibm', 'axe', 'wave']);
  assert.deepEqual(facts.map(fact => fact.name), ['Accessibility Checker', 'Axe', 'WAVE']);
});

test('getRuleEnginesFacts returns an empty array for an empty set', () => {
  const facts = getRuleEnginesFacts(new Set());
  assert.deepEqual(facts, []);
});

test('getIssueSpec returns a specification for a known non-ignorable issue', () => {
  const spec = getIssueSpec('linkNoText');
  assert.ok(spec);
  assert.ok(spec.summary);
  assert.ok(spec.wcag);
  assert.ok([1, 2, 3, 4].includes(spec.weight));
  assert.ok(spec.why);
});

test('getIssueSpec returns null for an unknown issue ID', () => {
  const spec = getIssueSpec('nonexistentIssue');
  assert.equal(spec, null);
});

test('getIssueSpec returns null for the ignorable issue ID', () => {
  const spec = getIssueSpec('ignorable');
  assert.equal(spec, null);
});

test('getReportBasics returns an error for a nonexistent report', async () => {
  process.env.DB_DIR = require('../test/dbFixture.cjs').fixtureDBDir;
  const basics = await getReportBasics('999999T9999', 'xyz');
  assert.ok(basics.error);
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

test('processTestRequest returns an error for a duplicate recommendation', async () => {
  process.env.DB_DIR = require('../test/dbFixture.cjs').fixtureDBDir;
  // Submit the same request twice; the second should be a duplicate.
  await processTestRequest('test', 'Dup Page', 'https://example.com/dup', 'A reason that is long enough.');
  const result = await processTestRequest('test', 'Dup Page', 'https://example.com/dup', 'A reason that is long enough.');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Duplicate request');
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

test('getResponseMetadata returns an identifier and date string', () => {
  const meta = getResponseMetadata();
  assert.ok(meta.identifier);
  assert.ok(meta.identifier.includes('-'));
  assert.ok(meta['date and time']);
  assert.equal(typeof meta['date and time'], 'string');
});

test('getToolsFacts returns facts about the Kilotest tool collection', () => {
  const facts = getToolsFacts();
  assert.equal(facts.name, 'Kilotest');
  assert.ok(facts.description);
  assert.ok(facts.description['what Kilotest does']);
  assert.ok(facts.description['how to retrieve findings']);
  assert.ok(facts.description['how to generate more findings']);
});
