/*
  listDiagnoses.test.js
  Tests for api/listDiagnoses.js using the fixture corpus, with emphasis on outcome handling.
*/

// IMPORTS

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {response} = require('./listDiagnoses');

// SETUP AND TEARDOWN

const savedDBDir = process.env.DB_DIR;

before(() => {
  process.env.DB_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'db');
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
  const body = await response(['0', 'linkNoText', '260101T0000', 'mix']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'];
  assert.equal(diagnoses.length, 2);
  const rules = diagnoses.map(d => d['identifier of the violated rule']).sort();
  assert.deepEqual(rules, ['r11', 'r11']);
  const descriptions = diagnoses.map(d => d['description of the violation']);
  assert.ok(descriptions.every(d => d === 'The link does not have an accessible name'));
});

test('listDiagnoses returns 0 diagnoses when all instances are cantTell', async () => {
  const body = await response(['0', 'focusIndicationBad', '260101T0001', 'ct']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'];
  assert.equal(diagnoses.length, 0);
});

test('listDiagnoses treats missing outcome as a violation', async () => {
  const body = await response(['0', 'linkNoText', '260101T0002', 'no']);
  const diagnoses = body['response content']['diagnoses of how the element exhibited the issue'];
  assert.equal(diagnoses.length, 1);
  assert.equal(diagnoses[0]['description of the violation'], 'Button has no accessible name');
  assert.equal(diagnoses[0]['severity of the violation on a 0-to-3 scale'], 3);
});

test('listDiagnoses returns element basics from the catalog', async () => {
  const body = await response(['0', 'linkNoText', '260101T0000', 'mix']);
  const elementBasics = body['response content']['basics about the element'];
  assert.equal(elementBasics.identifier, '0');
  assert.equal(elementBasics['tag name'], 'A');
  assert.equal(elementBasics['inner text'], 'About Us');
});

test('listDiagnoses returns element details from the catalog', async () => {
  const body = await response(['0', 'linkNoText', '260101T0000', 'mix']);
  const elementDetails = body['response content']['details about the element'];
  assert.equal(elementDetails['start tag'], '<a>');
  assert.equal(elementDetails['XPath'], '/html/body/a[1]');
  assert.equal(elementDetails['x, y, width, and height of bounding box'], '10:20:80:30');
});

test('listDiagnoses returns an error for an unknown issue ID', async () => {
  const body = await response(['0', 'nonexistentIssue', '260101T0000', 'mix']);
  const basics = body['response content']['basics about the issue'];
  assert.ok(basics.error);
});

test('listDiagnoses returns an error for a nonexistent catalog index', async () => {
  const body = await response(['999', 'linkNoText', '260101T0000', 'mix']);
  const basics = body['response content']['basics about the element'];
  assert.ok(basics.error);
});

test('listDiagnoses returns an error for a nonexistent report', async () => {
  const body = await response(['0', 'linkNoText', '999999T9999', 'xyz']);
  const basics = body['response content']['basics about the report'];
  assert.ok(basics.error);
});
