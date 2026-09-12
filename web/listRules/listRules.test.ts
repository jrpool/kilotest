// @ts-nocheck: transitional (not yet under strict type checking).
/*
  listRules.test.ts
  Unit tests for web/listRules/index.ts.
*/

// IMPORTS

import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';

// Mock testaro-issues with an added rule having what === ruleID,
// covering the dead branch on line 55 of listRules/index.ts.
import * as testaroIssues from 'testaro-issues';
const originalRules = testaroIssues.rules;
const patchEngine = Object.keys(originalRules)[0];
const patchType = Object.keys(originalRules[patchEngine])[0];
const patchRuleID = '__testWhatEqualsID__';
const patchedRules = {
  ...originalRules,
  [patchEngine]: {
    ...originalRules[patchEngine],
    [patchType]: {
      ...originalRules[patchEngine][patchType],
      [patchRuleID]: {what: patchRuleID}
    }
  }
};
// Add the patched rule to an existing issue's rule list.
const originalIssueRules = testaroIssues.issueRules;
const patchIssueID = Object.keys(originalIssueRules)[0];
const patchedIssueRules = {
  ...originalIssueRules,
  [patchIssueID]: {
    ...originalIssueRules[patchIssueID],
    [patchEngine]: {
      ...originalIssueRules[patchIssueID][patchEngine],
      [patchType]: [
        ...originalIssueRules[patchIssueID][patchEngine][patchType],
        patchRuleID
      ]
    }
  }
};
mock.module('testaro-issues', {
  exports: {
    ...testaroIssues,
    rules: patchedRules,
    issueRules: patchedIssueRules
  }
});

const {answer} = await import('./index.ts');

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

test('listRules renders a rule without description when what equals ruleID', async () => {
  // The patched issue has a rule where what === ruleID.
  const result = await answer(patchIssueID);
  assert.equal(result.status, 'ok');
  // The rule should appear without a colon-description separator.
  assert.ok(result.answerPage.includes(patchRuleID));
});

test('listRules returns ok for an issue with no rules in issueRules', async () => {
  // docHeadingNotH1 exists in issueSpecs but has no entry in issueRules.
  const result = await answer('docHeadingNotH1');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
});
