/*
  reportDisagreement.test.ts
  Tests for api/reportDisagreement.ts using the fixture corpus, with mocked side effects.
*/

// IMPORTS

import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Blank the alert configuration unconditionally, before ./reportDisagreement.ts (which
// calls sendAlert) is ever imported below, so this file sends no real alert emails
// even when run directly rather than via `npm test`.
for (const key of ['MANAGER_EMAIL', 'ALERT_API_HOST', 'ALERT_API_PATH', 'ALERT_API_KEY', 'ALERT_FROM']) {
  process.env[key] = '';
}

// ENVIRONMENT

const testDir = path.join(import.meta.dirname, '../test/fixtures/disagreements');
process.env.DISAGREEMENTS_PATH = path.join(testDir, 'disagreements.json');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;
let logged: any[] = [];
const originalLog = console.log;

before(async () => {
  process.env.DB_DIR = (await import('../test/dbFixture.ts')).fixtureDBDir;
});

// Capture console.log so the alert sendAlert emits can be observed. The alert
// configuration is blanked above, so sendAlert logs a WARNING instead of sending.
beforeEach(async () => {
  logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  await fs.mkdir(testDir, {recursive: true});
  await fs.writeFile(process.env.DISAGREEMENTS_PATH!, '[]\n');
});

import {response} from './reportDisagreement.ts';

after(async () => {
  console.log = originalLog;
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
  await fs.rm(testDir, {recursive: true, force: true});
});

// TESTS

test('reportDisagreement rejects a reason shorter than 20 characters', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'Too short']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('reason'));
  assert.ok(
    !logged.some(line => line.startsWith('WARNING (Kilotest: diagnosis disagreement received)'))
  );
});

test('reportDisagreement rejects a reason longer than 1000 characters', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'x'.repeat(1001)]);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('reason'));
});

test('reportDisagreement rejects a nonexistent report', async () => {
  const body = await response(['linkNoText', '999999T9999-xyz', '0', 'axe', 'r11', 'This diagnosis is wrong, in my opinion']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('report'));
});

test('reportDisagreement rejects an element not in the report', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '999', 'axe', 'r11', 'This diagnosis is wrong, in my opinion']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('element'));
});

test('reportDisagreement rejects a diagnosis no rule engine reported', async () => {
  // The mixed report has axe and alfa diagnoses of rule r11 for element 0 and issue
  // linkNoText, but no ibm diagnosis, so this engineID/ruleID pair matches nothing.
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'ibm', 'r11', 'This diagnosis is wrong, in my opinion']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('no such diagnosis'));
});

test('reportDisagreement rejects a rule ID reported only under a different issue', async () => {
  const body = await response(['focusIndicationBad', '260101T0000-mix', '0', 'axe', 'r11', 'This diagnosis is wrong, in my opinion']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('no such diagnosis'));
});

test('reportDisagreement accepts a valid disagreement and notifies the manager', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  assert.ok(details['date and time received']);
  assert.equal(details['diagnosis you disagree with']['identifier of the rule engine'], 'axe');
  assert.equal(details['diagnosis you disagree with']['identifier of the violated rule'], 'r11');
  assert.equal(details.disposition, 'received and logged; manager notified');
  assert.ok(logged.some(line =>
    line.startsWith('WARNING (Kilotest: diagnosis disagreement received)')
    && line.includes('Disagreements now awaiting review: 1 of 20')
  ));
});

test('reportDisagreement records a valid disagreement to the disagreements file', async () => {
  await response(['linkNoText', '260101T0000-mix', '0', 'alfa', 'r11', 'The element does have an accessible name']);
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  assert.equal(disagreements.length, 1);
  assert.equal(disagreements[0].engineID, 'alfa');
  assert.equal(disagreements[0].ruleID, 'r11');
  assert.equal(disagreements[0].issueID, 'linkNoText');
  assert.ok(disagreements[0].timeStamp);
});

test('reportDisagreement rejects a disagreement identical to one already on file', async () => {
  const args = ['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name'];
  const firstBody = await response(args);
  const firstDetails = firstBody['response content']['details about your request'] as any;
  assert.equal(firstDetails.error, undefined);
  const secondBody = await response(args);
  const secondDetails = secondBody['response content']['details about your request'] as any;
  assert.ok(secondDetails.error.includes('identical to one already submitted'));
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  // The duplicate was not recorded a second time.
  assert.equal(disagreements.length, 1);
});

test('reportDisagreement accepts the same reason about a different diagnosis', async () => {
  await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'alfa', 'r11', 'The element does have an accessible name']);
  const details = body['response content']['details about your request'] as any;
  assert.equal(details.error, undefined);
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  assert.equal(disagreements.length, 2);
});

test('reportDisagreement creates the disagreements file when it does not exist', async () => {
  await fs.unlink(process.env.DISAGREEMENTS_PATH!);
  await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  assert.equal(disagreements.length, 1);
});

test('reportDisagreement rejects a disagreement with a fallback channel when the inbox is full', async () => {
  // Fill disagreements.json with 20 distinct disagreements, reaching the cap.
  const filler = Array.from({length: 20}, (_, i) => ({
    timeStamp: '260101T0000',
    issueID: 'linkNoText',
    reportID: '260101T0000-mix',
    catalogIndex: '0',
    engineID: 'axe',
    ruleID: `r${i}`,
    reason: `Filler disagreement number ${i}, long enough to pass the length check.`
  }));
  await fs.writeFile(process.env.DISAGREEMENTS_PATH!, JSON.stringify(filler));
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
  const details = body['response content']['details about your request'] as any;
  assert.ok(details.error.includes('too many disagreements are awaiting review right now.'));
  assert.ok(details.error.includes('https://github.com/jrpool/kilotest/issues'));
  assert.ok(details.error.includes('info@kilotest.com'));
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  // The rejected disagreement was not recorded.
  assert.equal(disagreements.length, 20);
});

test('reportDisagreement never rejects for a full inbox when DISAGREEMENTS_MAX is 0 (no limit)', async () => {
  process.env.DISAGREEMENTS_MAX = '0';
  try {
    // Fill disagreements.json past the default cap.
    const filler = Array.from({length: 25}, (_, i) => ({
      timeStamp: '260101T0000',
      issueID: 'linkNoText',
      reportID: '260101T0000-mix',
      catalogIndex: '0',
      engineID: 'axe',
      ruleID: `r${i}`,
      reason: `Filler disagreement number ${i}, long enough to pass the length check.`
    }));
    await fs.writeFile(process.env.DISAGREEMENTS_PATH!, JSON.stringify(filler));
    const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
    const details = body['response content']['details about your request'] as any;
    assert.equal(details.error, undefined);
  }
  finally {
    delete process.env.DISAGREEMENTS_MAX;
  }
});

test('reportDisagreement does not record an invalid disagreement', async () => {
  await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'short']);
  const disagreements = JSON.parse(await fs.readFile(process.env.DISAGREEMENTS_PATH!, 'utf8'));
  assert.equal(disagreements.length, 0);
});

test('reportDisagreement includes tool name and metadata', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0', 'axe', 'r11', 'The element does have an accessible name']);
  assert.equal(body['tool name'], 'reportDisagreement');
  assert.ok(body['response metadata'].identifier);
});
