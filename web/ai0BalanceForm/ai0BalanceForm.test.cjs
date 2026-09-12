/*
  ai0BalanceForm.test.cjs
  Unit tests for web/ai0BalanceForm/index.ts.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs/promises');
const {parse} = require('node-html-parser');
const {answer} = require('./index.ts');

// CONSTANTS

const balancePath = path.join(__dirname, '..', '..', 'ai0Balance.json');

// SETUP AND TEARDOWN

const savedAuthCode = process.env.AUTH_CODE;
let savedBalance;

before(async () => {
  process.env.AUTH_CODE = 'test-auth-code';
  savedBalance = await fs.readFile(balancePath, 'utf8').catch(() => null);
  // Ensure the balance file exists so the try block in index.js is covered.
  if (savedBalance === null) {
    await fs.writeFile(balancePath, '{"balance":0}\n');
  }
});

after(async () => {
  if (savedAuthCode !== undefined) {
    process.env.AUTH_CODE = savedAuthCode;
  }
  if (savedBalance !== null) {
    await fs.writeFile(balancePath, savedBalance);
  }
  else {
    await fs.unlink(balancePath).catch(() => {});
  }
});

// TESTS

test('ai0BalanceForm displays the current balance when no newBalance is submitted', async () => {
  const result = await answer(null, '');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage);
  const html = parse(result.answerPage);
  assert.ok(html.querySelector('title'));
});

test('ai0BalanceForm returns an error for an invalid auth code', async () => {
  const result = await answer(null, 'authCode=wrong&newBalance=5.00');
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Invalid authorization code');
});

test('ai0BalanceForm records a valid new balance with valid auth code', async () => {
  const result = await answer(null, 'authCode=test-auth-code&newBalance=2.50');
  assert.equal(result.status, 'ok');
  assert.ok(result.answerPage.includes('$2.5 is the'));
  // Verify the file was written.
  const data = JSON.parse(await fs.readFile(balancePath, 'utf8'));
  assert.equal(data.balance, 2.50);
});

test('ai0BalanceForm does not record an invalid balance', async () => {
  // 150 is out of range (>= 100).
  const result = await answer(null, 'authCode=test-auth-code&newBalance=150');
  assert.equal(result.status, 'ok');
  // The oldBalance should not show the new value.
  assert.ok(!result.answerPage.includes('$150 is the'));
});

test('ai0BalanceForm shows no-balance message when balance file is missing', async () => {
  await fs.unlink(balancePath).catch(() => {});
  try {
    const result = await answer(null, '');
    assert.equal(result.status, 'ok');
    assert.ok(result.answerPage.includes('There is no'));
  }
  finally {
    await fs.writeFile(balancePath, savedBalance || '{"balance":0}');
  }
});
