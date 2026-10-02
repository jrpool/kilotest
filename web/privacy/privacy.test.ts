/*
  privacy.test.ts
  Unit tests for web/privacy/index.ts, covering the answer export.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answer} from './index.ts';

// TESTS

test('answer returns the privacy policy page', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('<h1>Privacy policy</h1>'));
});
