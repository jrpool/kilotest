/*
  classification.ts
  A mock of the rule classification of the testaro-issues dependency, for tests whose results must not depend on that classification. A test file installs it with mockClassification before importing any module that imports testaro-issues.
*/

// IMPORTS

import {mock} from 'node:test';

// CONSTANTS

// Mock issue specifications, by issue identifier.
export const mockIssues = {
  mockIssueA: {summary: 'mock issue A', why: 'Mock reason A', wcag: '1.1.1', weight: 4},
  mockIssueB: {summary: 'mock issue B', why: 'Mock reason B', wcag: '3.1.5', weight: 1},
  mockIssueC: {summary: 'mock issue C', why: 'Mock reason C', wcag: '2.4.4', weight: 3},
  ignorable: {summary: 'ignorable', why: 'No known impact', wcag: '', weight: 1}
};
// Mock rule specifications, by rule-engine identifier.
export const mockRules = {
  alfa: {
    invariant: {
      mockAlfaRule: {issueID: 'mockIssueA', quality: 1, what: 'Mock Alfa rule'}
    },
    variable: {}
  },
  axe: {
    invariant: {
      mockRule: {issueID: 'mockIssueA', quality: 1, what: 'Mock rule'},
      mockOtherRule: {issueID: 'mockIssueB', quality: 1, what: 'Other mock rule'},
      mockThirdRule: {issueID: 'mockIssueC', quality: 1, what: 'Third mock rule'},
      mockIgnorableRule: {issueID: 'ignorable', quality: 1, what: 'Ignorable mock rule'}
    },
    variable: {}
  },
  nuVal: {
    invariant: {},
    variable: {
      'Mock message about .+\\.': {issueID: 'mockIssueB', quality: 1, what: 'Mock message'}
    }
  }
};

// FUNCTIONS

// Replaces the testaro-issues module with the mock classification for any later import.
export const mockClassification = () => {
  mock.module('testaro-issues', {
    exports: {issues: mockIssues, rules: mockRules}
  } as any);
};
