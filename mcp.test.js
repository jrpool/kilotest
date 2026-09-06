/*
  mcp.test.js
  Tests for mcp.js, covering tool registration and handler behavior.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {mcpPath, createMCPServer} = require('./mcp');

// CONSTANTS

// Set DB_DIR to the fixture database for all tests.
process.env.DB_DIR = path.join(__dirname, 'test', 'fixtures', 'db');

// TESTS

test('mcpPath is /mcp', () => {
  assert.equal(mcpPath, '/mcp');
});

test('createMCPServer registers all 8 tools', () => {
  const server = createMCPServer();
  const toolNames = Object.keys(server._registeredTools);
  assert.equal(toolNames.length, 8);
  assert.deepEqual(toolNames, [
    'listReports',
    'listIssues',
    'listViolators',
    'listDiagnoses',
    'getReport',
    'requestTest',
    'requestRetest',
    'requestFeature'
  ]);
});

test('each tool has a description and a handler function', () => {
  const server = createMCPServer();
  const tools = server._registeredTools;
  for (const [name, tool] of Object.entries(tools)) {
    assert.ok(tool.description, `${name} has a description`);
    assert.equal(typeof tool.handler, 'function', `${name} has a handler function`);
  }
});

test('listReports handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listReports.handler({});
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('listIssues handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listIssues.handler({
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('listViolators handler returns content and structuredContent for a valid issue', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listViolators.handler({
    issueID: 'linkNoText',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('listDiagnoses handler returns content and structuredContent for a valid diagnosis', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listDiagnoses.handler({
    catalogIndex: '0',
    issueID: 'linkNoText',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('getReport handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.getReport.handler({
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('requestTest handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.requestTest.handler({
    description: 'Test Page',
    URL: 'https://example.com/test',
    reason: 'Because accessibility matters'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('requestRetest handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.requestRetest.handler({
    timeStamp: '260101T0000',
    jobID: 'mix',
    reason: 'Because the report is obsolete'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('requestFeature handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.requestFeature.handler({
    feature: 'A new feature idea'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
});

test('listIssues handler returns an error for a nonexistent report', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listIssues.handler({
    timeStamp: '990101T0000',
    jobID: 'xxx'
  });
  const reportBasics = result.structuredContent['response content']['basics about the report'];
  assert.ok(reportBasics.error);
});

test('listViolators handler returns an error for an unknown issue', async () => {
  const server = createMCPServer();
  const result = await server._registeredTools.listViolators.handler({
    issueID: 'nonexistentIssue',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  const issueBasics = result.structuredContent['response content']['basics about the issue'];
  assert.ok(issueBasics.error);
});
