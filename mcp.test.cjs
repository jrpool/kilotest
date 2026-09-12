/*
  mcp.test.cjs
  Tests for mcp.js, covering tool registration and handler behavior.
*/

// IMPORTS

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const {mcpPath, createMCPServer} = require('./mcp.cjs');

// CONSTANTS

// Set DB_DIR to the fixture database for all tests.
process.env.DB_DIR = require('./test/dbFixture.cjs').fixtureDBDir;

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

// INTEGRATION TESTS FOR handleMCP

// Helper: sends a single MCP JSON-RPC request to a local server and returns the parsed SSE response.
const sendMCPRequest = (port, method, params, id) => new Promise((resolve, reject) => {
  const body = JSON.stringify({jsonrpc: '2.0', method, params, id});
  const req = http.request({
    port,
    method: 'POST',
    path: '/mcp',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'content-length': Buffer.byteLength(body)
    }
  }, res => {
    let data = '';
    res.on('data', chunk => {
      data += chunk;
    });
    res.on('end', () => {
      resolve({statusCode: res.statusCode, headers: res.headers, body: data});
    });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// Helper: parses the JSON-RPC result from an SSE response body.
const parseSSEResult = body => {
  const jsonLine = body.split('\n').find(line => line.startsWith('data: '));
  if (!jsonLine) {
    throw new Error('No data line in SSE response');
  }
  return JSON.parse(jsonLine.slice(6));
};

// Helper: starts a local HTTP server with handleMCP and returns it.
const startMCPServer = () => new Promise(resolve => {
  const {handleMCP} = require('./mcp.cjs');
  const server = http.createServer((req, res) => handleMCP(req, res));
  server.listen(0, () => resolve(server));
});

// Helper: closes a server with a timeout fallback.
const closeMCPServer = server => new Promise(resolve => {
  if (!server) {
    resolve();
    return;
  }
  server.closeAllConnections?.();
  const timer = setTimeout(() => {
    server.closeAllConnections?.();
    resolve();
  }, 1000);
  server.close(() => {
    clearTimeout(timer);
    resolve();
  });
});

test('handleMCP responds to initialize with server info', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await sendMCPRequest(port, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {name: 'test', version: '1.0'}
    }, 1);
    assert.equal(res.statusCode, 200);
    const result = parseSSEResult(res.body);
    assert.equal(result.result.serverInfo.name, 'Kilotest');
    assert.equal(result.result.protocolVersion, '2025-06-18');
  }
  finally {
    await closeMCPServer(server);
  }
});

test('handleMCP lists all 8 tools via tools/list', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await sendMCPRequest(port, 'tools/list', {}, 2);
    assert.equal(res.statusCode, 200);
    const result = parseSSEResult(res.body);
    const toolNames = result.result.tools.map(t => t.name);
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
  }
  finally {
    await closeMCPServer(server);
  }
});

test('handleMCP executes listReports tool via tools/call', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await sendMCPRequest(port, 'tools/call', {
      name: 'listReports',
      arguments: {}
    }, 3);
    assert.equal(res.statusCode, 200);
    const result = parseSSEResult(res.body);
    assert.ok(result.result.content);
    assert.equal(result.result.content[0].type, 'text');
  }
  finally {
    await closeMCPServer(server);
  }
});
