/*
  renewWCAG.test.cjs
  Unit tests for web/renewWCAG/index.ts, covering auth, fetch status, and success branches.
*/

// IMPORTS

const {test, before, after, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {parse} = require('node-html-parser');

// CONSTANTS

const fixtureDBDir = require('../../test/dbFixture.cjs').fixtureDBDir;
const wcagMapPath = path.join(__dirname, '..', '..', 'wcagMap.json');

// SETUP AND TEARDOWN

before(async () => {
  process.env.DB_DIR = fixtureDBDir;
  process.env.AUTH_CODE = 'test-auth-code';
});

let originalFetch;
let wcagMapBackup;

afterEach(async () => {
  // Restore the original fetch after each test.
  if (originalFetch !== undefined) {
    global.fetch = originalFetch;
    originalFetch = undefined;
  }
  // Restore the wcagMap.json file if it was backed up.
  if (wcagMapBackup !== undefined) {
    await fs.writeFile(wcagMapPath, wcagMapBackup);
    wcagMapBackup = undefined;
  }
});

after(async () => {
  // Ensure fetch is restored.
  if (originalFetch !== undefined) {
    global.fetch = originalFetch;
    originalFetch = undefined;
  }
});

// HELPER

// Replaces global.fetch with a mock that returns the given status and body.
const mockFetch = (status, body = '') => {
  originalFetch = global.fetch;
  // @ts-expect-error: Replacing the real function with a mock for testing.
  global.fetch = async () => ({
    status,
    text: async () => body
  });
};

// TESTS

test('answer returns an error for an invalid authorization code', async () => {
  const {answer} = require('./index.ts');
  const result = await answer('wrong-code');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Authorization code invalid');
});

test('answer returns an error when the WCAG map source returns a non-200 status', async () => {
  mockFetch(404);
  const {answer} = require('./index.ts');
  const result = await answer('test-auth-code');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'WCAG map source not retrieved');
});

test('answer returns ok and rewrites the WCAG map when the source returns valid entries', async () => {
  // Back up the existing wcagMap.json before the test overwrites it.
  wcagMapBackup = await fs.readFile(wcagMapPath, 'utf8');
  // Create mock HTML with entries matching the regex in index.js.
  const mockHTML = [
    '<a href="understanding/contrast-minimum"><span class="secno">1.4.3 </span>',
    '<a href="understanding/non-text-content"><span class="secno">1.1.1 </span>',
    '<a href="understanding/target-size-minimum"><span class="secno">2.5.8 </span>'
  ].join('\n');
  mockFetch(200, mockHTML);
  const {answer} = require('./index.ts');
  const result = await answer('test-auth-code');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage, 'answerPage should be present');
  // Verify the HTML is well-formed.
  const doc = parse(result.answerPage);
  const h1 = doc.querySelector('h1');
  assert.ok(h1);
  assert.ok(h1.textContent.includes('WCAG map renewed'));
  // Verify the wcagMap.json was updated with the entries.
  const updatedMap = JSON.parse(await fs.readFile(wcagMapPath, 'utf8'));
  assert.equal(updatedMap['1.4.3'], 'understanding/contrast-minimum');
  assert.equal(updatedMap['1.1.1'], 'understanding/non-text-content');
  assert.equal(updatedMap['2.5.8'], 'understanding/target-size-minimum');
});

test('answer returns an error when matchAll returns no entries', async () => {
  // Mock matchAll to return null, covering the dead else branch on lines 48-55.
  const originalMatchAll = String.prototype.matchAll;
  String.prototype.matchAll = function() {
    return null;
  };
  mockFetch(200, '<html></html>');
  try {
    const {answer} = require('./index.ts');
    const result = await answer('test-auth-code');
    assert.equal(result.status, 'error');
    assert.equal(result.message, 'No entries found in WCAG map source');
  }
  finally {
    String.prototype.matchAll = originalMatchAll;
  }
});
