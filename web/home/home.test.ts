/*
  home.test.ts
  Unit tests for web/home/index.ts, covering the answer export.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answer} from './index.ts';

// TESTS

test('answer returns the home page', async () => {
  const result = await answer();
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('<h1>Kilotest</h1>'));
  assert.ok(result.answerPage.includes('application/ld+json'));
});
