/*
  aboutExemplars.test.ts
  Unit tests for web/aboutExemplars/index.ts.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answer} from './index.ts';

// TESTS

test('answer returns the aboutExemplars page with status ok', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  assert.ok(result.answerPage.length > 0);
});
