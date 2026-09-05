/*
  util.test.js
  Tests for api/util.js.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {getRuleEngineFacts, getRuleEnginesFacts} = require('./util');

// TESTS

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
