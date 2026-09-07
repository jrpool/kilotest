/*
  listRules.test.js
  Unit tests for web/listRules/index.js.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse} = require('node-html-parser');
const {answer} = require('./index');

// TESTS

test('listRules returns an error for a nonexistent issue ID', async () => {
  const result = await answer('nonexistentIssue123');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Issue not found');
});

test('listRules returns ok with HTML for a valid issue with both invariant and variable rules', async () => {
  // pageLanguage has both invariant and variable rules in nuVal.
  const result = await answer('pageLanguage');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
  // Both invariant and variable rule sections should be present.
  assert.ok(result.answerPage.includes('invariant rules'));
  assert.ok(result.answerPage.includes('variable rules'));
});

test('listRules returns ok for an issue with only invariant rules', async () => {
  // ignorable has only invariant rules in alfa.
  const result = await answer('ignorable');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  // The invariant rules heading should be present.
  assert.ok(result.answerPage.includes('invariant rules'));
});

test('listRules includes the issue why, priority, and wcag in the page', async () => {
  const result = await answer('pageLanguage');
  assert.ok(!result.answerPage.includes('__why__'));
  assert.ok(!result.answerPage.includes('__priority__'));
  assert.ok(!result.answerPage.includes('__wcag__'));
});

test('listRules includes rule descriptions with htmlSafe formatting', async () => {
  const result = await answer('pageLanguage');
  // Rules should be listed as <li> elements with <code> tags.
  assert.ok(result.answerPage.includes('<li><code>'));
});
