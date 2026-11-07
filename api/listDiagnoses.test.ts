/*
  listDiagnoses.test.ts
  Tests for api/listDiagnoses.ts using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {response} from './listDiagnoses.ts';
import {listDiagnosesResponseSchema} from './schemas.ts';

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(async () => {
  process.env.DB_DIR = (await import('../test/dbFixture.ts')).fixtureDBDir;
});

after(() => {
  if (savedDBDir !== undefined) {
    process.env.DB_DIR = savedDBDir;
  }
  else {
    delete process.env.DB_DIR;
  }
});

// TESTS

test('listDiagnoses returns 2 diagnoses for catalogIndex 0, linkNoText, in the mixed report (axe and alfa, excluding cantTell)', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'] as any;
  assert.equal(diagnoses.length, 2);
  const rules = diagnoses.map((d: any) => d['identifier of the violated rule']).sort();
  assert.deepEqual(rules, ['r11', 'r11']);
  const descriptions = diagnoses.map((d: any) => d['description of the violation']);
  assert.ok(descriptions.every((d: any) => d === 'The link does not have an accessible name'));
});

test('listDiagnoses returns 0 diagnoses when all instances are cantTell', async () => {
  const body = await response(['focusIndicationBad', '260101T0001-ct', '0']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'] as any;
  assert.equal(diagnoses.length, 0);
});

test('listDiagnoses treats missing outcome as a violation', async () => {
  const body = await response(['linkNoText', '260101T0002-no', '0']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'] as any;
  assert.equal(diagnoses.length, 1);
  assert.equal(diagnoses[0]['description of the violation'], 'Button has no accessible name');
  assert.equal(diagnoses[0]['severity of the violation on a 0-to-3 scale'], 3);
});

test('listDiagnoses returns element basics from the catalog', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0']);
  const elementBasics = body['response content']['basics about the element'] as any;
  assert.equal(elementBasics.identifier, '0');
  assert.equal(elementBasics['tag name'], 'A');
  assert.equal(elementBasics['inner text'], 'About Us');
});

test('listDiagnoses returns element details from the catalog', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '0']);
  const elementDetails = body['response content']['details about the element'] as any;
  assert.equal(elementDetails['start tag'], '<a>');
  assert.equal(elementDetails['XPath'], '/html/body/a[1]');
  assert.equal(elementDetails['x, y, width, and height of bounding box'], '10:20:80:30');
});

test('listDiagnoses returns an error for an unknown issue ID', async () => {
  const body = await response(['nonexistentIssue', '260101T0000-mix', '0']);
  const basics = body['response content']['basics about the issue'] as any;
  assert.ok(basics.error);
});

test('listDiagnoses returns an error for a nonexistent catalog index', async () => {
  const body = await response(['linkNoText', '260101T0000-mix', '999']);
  const basics = body['response content']['basics about the element'] as any;
  assert.ok(basics.error);
});

test('listDiagnoses returns an error for a nonexistent report', async () => {
  const body = await response(['linkNoText', '999999T9999-xyz', '0']);
  const basics = body['response content']['basics about the report'] as any;
  assert.ok(basics.error);
});

test('listDiagnoses returns guideline layer for an issue with a short WCAG code', async () => {
  const body = await response(['duplicateID', '260101T0009-brd', '0']);
  const issueBasics = body['response content']['basics about the issue'] as any;
  assert.equal(issueBasics['related WCAG standard'].layer, 'guideline');
  assert.equal(issueBasics['related WCAG standard'].identifier, '4.1');
});

test('listDiagnoses returns null tag name and inner text for a catalog item missing them', async () => {
  const body = await response(['duplicateID', '260101T0009-brd', '1']);
  const elementBasics = body['response content']['basics about the element'] as any;
  assert.equal(elementBasics['tag name'], null);
  assert.equal(elementBasics['inner text'], null);
});

test('listDiagnoses returns null rule ID when ruleID equals what', async () => {
  const body = await response(['duplicateID', '260101T0009-brd', '0']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'] as any;
  const axeDiagnosis = diagnoses.find((d: any) => d['description of the violation'] === 'r99');
  assert.ok(axeDiagnosis);
  assert.equal(axeDiagnosis['identifier of the violated rule'], null);
});

test('listDiagnoses defaults count to 1 when count is missing', async () => {
  const body = await response(['duplicateID', '260101T0009-brd', '1']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'] as any;
  const ibmDiagnosis = diagnoses.find((d: any) => d['description of the violation'] === 'Element has no role');
  assert.ok(ibmDiagnosis);
  assert.equal(ibmDiagnosis['count of violations of the rule by the element'], 1);
});

test('listDiagnoses returns null for missing start tag, XPath, and bounding box', async () => {
  const body = await response(['duplicateID', '260101T0009-brd', '2']);
  const elementDetails = body['response content']['details about the element'] as any;
  assert.equal(elementDetails['start tag'], null);
  assert.equal(elementDetails['XPath'], null);
  assert.equal(elementDetails['x, y, width, and height of bounding box'], null);
});

test('listDiagnoses returns issue error for a falsy issue ID', async () => {
  const body = await response(['', '260101T0009-brd', '0']);
  const issueBasics = body['response content']['basics about the issue'] as any;
  assert.ok(issueBasics.error);
});

test('listDiagnoses response conforms to its response schema', async () => {
  // parse() catches missing or mistyped keys; comparing the parsed result to the
  // original catches extra keys that zod strips but that the strict JSON schema
  // advertised to MCP clients (additionalProperties: false) rejects.
  const body = await response(['linkNoText', '260101T0000-mix', '0']);
  assert.deepEqual(listDiagnosesResponseSchema.parse(body), body);
});
