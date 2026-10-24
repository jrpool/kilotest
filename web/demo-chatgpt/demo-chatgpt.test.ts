/*
  demo.test.ts
  Unit tests for web/demo/index.ts, covering the answer export.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answer} from './index.ts';

// TESTS

test('answer returns the demonstration page', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('ChatGPT demonstration'));
});
