/*
  terms.test.ts
  Unit tests for web/terms/index.ts, covering the answer export.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answer} from './index.ts';

// TESTS

test('answer returns the terms of service page', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('provided as is'));
});
