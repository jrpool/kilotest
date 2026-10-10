/*
  mcp.test.ts
  Tests for mcp.js, covering tool registration and handler behavior.
*/

// IMPORTS

import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mcpPath, createMCPServer, handleMCP} from './mcp.ts';
import {metricsPath} from './util.ts';
import fs from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

// CONSTANTS

// Set DB_DIR to the fixture database for all tests.
process.env.DB_DIR = (await import('./test/dbFixture.ts')).fixtureDBDir;

// FUNCTIONS

// Returns the current count for an MCP tool in the metrics file, or 0 if the file or the
// tool's entry is absent (the file does not exist until the first metric is recorded).
const getToolCallCount = (toolName: string): number => {
  if (!fs.existsSync(metricsPath())) {
    return 0;
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath(), 'utf8'));
  return metrics.mcpToolCalls[toolName] ?? 0;
};

// TESTS

test('mcpPath is /mcp', () => {
  assert.equal(mcpPath, '/mcp');
});

test('createMCPServer registers all 12 tools', () => {
  const server = createMCPServer();
  const toolNames = Object.keys((server as any)._registeredTools);
  assert.equal(toolNames.length, 12);
  assert.deepEqual(toolNames, [
    'getKilotestOverview',
    'listPages',
    'listIssues',
    'listViolators',
    'listDiagnoses',
    'getReport',
    'requestNewTest',
    'requestRetest',
    'requestFeature',
    'orderNewTest',
    'orderRetest',
    'awaitTest'
  ]);
});

test('each tool has a description and a handler function', () => {
  const server = createMCPServer();
  const tools = (server as any)._registeredTools;
  for (const [name, tool] of Object.entries(tools) as [string, any][]) {
    assert.ok(tool.description, `${name} has a description`);
    assert.ok(
      tool.description.includes('front-end quality'),
      `${name} description includes the shared domain context`
    );
    assert.equal(typeof tool.handler, 'function', `${name} has a handler function`);
  }
});

test('getKilotestOverview handler returns overview text and records a metric', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('getKilotestOverview');
  const result = await (server as any)._registeredTools.getKilotestOverview.handler({});
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.content[0].text.includes('front-end quality'));
  assert.equal(getToolCallCount('getKilotestOverview'), countBefore + 1);
});

test('client receives instructions, server description, and the overview resource', async () => {
  const server = createMCPServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({name: 'test-client', version: '1.0.0'});
  await client.connect(clientTransport);
  assert.ok(client.getInstructions()?.includes('front-end quality'));
  assert.ok(client.getServerVersion()?.description?.includes('front-end quality'));
  const resources = await client.listResources();
  assert.deepEqual(resources.resources.map((r: any) => r.uri), ['docs://kilotest/overview']);
  const read = await client.readResource({uri: 'docs://kilotest/overview'});
  assert.equal(read.contents[0]?.mimeType, 'text/plain');
  assert.ok((read.contents[0] as any).text.includes('front-end quality'));
  await client.close();
  await server.close();
});

test('listPages handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('listPages');
  const result = await (server as any)._registeredTools.listPages.handler({});
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('listPages'), countBefore + 1);
});

test('listIssues handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('listIssues');
  const result = await (server as any)._registeredTools.listIssues.handler({
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('listIssues'), countBefore + 1);
});

test('listViolators handler returns content and structuredContent for a valid issue', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('listViolators');
  const result = await (server as any)._registeredTools.listViolators.handler({
    issueID: 'linkNoText',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('listViolators'), countBefore + 1);
});

test('listDiagnoses handler returns content and structuredContent for a valid diagnosis', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('listDiagnoses');
  const result = await (server as any)._registeredTools.listDiagnoses.handler({
    catalogIndex: '0',
    issueID: 'linkNoText',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('listDiagnoses'), countBefore + 1);
});

test('getReport handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('getReport');
  const result = await (server as any)._registeredTools.getReport.handler({
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('getReport'), countBefore + 1);
});

test('requestNewTest handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('requestNewTest');
  const result = await (server as any)._registeredTools.requestNewTest.handler({
    description: 'Test Page',
    URL: 'https://example.com/test',
    reason: 'Because accessibility matters'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('requestNewTest'), countBefore + 1);
});

test('requestRetest handler returns content and structuredContent for a valid report', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('requestRetest');
  const result = await (server as any)._registeredTools.requestRetest.handler({
    timeStamp: '260101T0000',
    jobID: 'mix',
    reason: 'Because the report is obsolete'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('requestRetest'), countBefore + 1);
});

test('requestFeature handler returns content and structuredContent', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('requestFeature');
  const result = await (server as any)._registeredTools.requestFeature.handler({
    feature: 'A new feature idea worth considering'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('requestFeature'), countBefore + 1);
});

test('orderNewTest handler returns content and structuredContent, and enqueues a job', async () => {
  const {jobsPath} = await import('./util.ts');
  const server = createMCPServer();
  const countBefore = getToolCallCount('orderNewTest');
  const result = await (server as any)._registeredTools.orderNewTest.handler({
    description: 'MCP Ordered Page',
    URL: 'https://example.com/mcp-ordered',
    reason: 'Because accessibility matters here'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('orderNewTest'), countBefore + 1);
  const reportIdentifier = result.structuredContent['response content']['disposition of your order']['report identifier'];
  assert.ok(reportIdentifier);
  const queuedPath = `${jobsPath()}/queue/${reportIdentifier.timeStamp}-${reportIdentifier.jobID}.json`;
  fs.unlinkSync(queuedPath);
});

test('orderRetest handler returns content and structuredContent, and enqueues a job', async () => {
  const {jobsPath} = await import('./util.ts');
  const server = createMCPServer();
  const countBefore = getToolCallCount('orderRetest');
  // 260202T0000-new is the latest report of "Mixed Outcomes Page" (260101T0000-mix is an
  // earlier, superseded report of the same page), so this order is accepted.
  const result = await (server as any)._registeredTools.orderRetest.handler({
    timeStamp: '260202T0000',
    jobID: 'new',
    reason: 'Because the report is obsolete'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(getToolCallCount('orderRetest'), countBefore + 1);
  const reportIdentifier = result.structuredContent['response content']['disposition of your order']['report identifier'];
  assert.ok(reportIdentifier);
  const queuedPath = `${jobsPath()}/queue/${reportIdentifier.timeStamp}-${reportIdentifier.jobID}.json`;
  fs.unlinkSync(queuedPath);
});

test('awaitTest handler returns content and structuredContent for an already-completed report', async () => {
  const server = createMCPServer();
  const countBefore = getToolCallCount('awaitTest');
  const result = await (server as any)._registeredTools.awaitTest.handler({
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  assert.ok(result.content);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent);
  assert.equal(result.structuredContent['response content']['disposition of your wait'].outcome, 'completed');
  assert.equal(getToolCallCount('awaitTest'), countBefore + 1);
});

test('listIssues handler returns an error for a nonexistent report', async () => {
  const server = createMCPServer();
  const result = await (server as any)._registeredTools.listIssues.handler({
    timeStamp: '990101T0000',
    jobID: 'xxx'
  });
  const reportBasics = result.structuredContent['response content']['basics about the report'];
  assert.ok(reportBasics.error);
});

test('listViolators handler returns an error for an unknown issue', async () => {
  const server = createMCPServer();
  const result = await (server as any)._registeredTools.listViolators.handler({
    issueID: 'nonexistentIssue',
    timeStamp: '260101T0000',
    jobID: 'mix'
  });
  const issueBasics = result.structuredContent['response content']['basics about the issue'];
  assert.ok(issueBasics.error);
});

// INTEGRATION TESTS FOR handleMCP

// Helper: sends a single MCP JSON-RPC request to a local server and returns the parsed SSE response.
const sendMCPRequest = (port: number, method: string, params: any, id: any): Promise<any> => new Promise((resolve, reject) => {
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
const parseSSEResult = (body: string) => {
  const jsonLine = body.split('\n').find(line => line.startsWith('data: '));
  if (!jsonLine) {
    throw new Error('No data line in SSE response');
  }
  return JSON.parse(jsonLine.slice(6));
};

// Helper: starts a local HTTP server with handleMCP and returns it.
const startMCPServer = (): Promise<any> => new Promise(resolve => {
  const server = http.createServer((req, res) => handleMCP(req, res));
  server.listen(0, () => resolve(server));
});

// Helper: closes a server with a timeout fallback.
const closeMCPServer = (server: any) => new Promise<void>(resolve => {
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
    assert.ok(result.result.serverInfo.description.includes('front-end quality'));
    assert.ok(result.result.instructions.includes('front-end quality'));
    assert.equal(result.result.protocolVersion, '2025-06-18');
  }
  finally {
    await closeMCPServer(server);
  }
});

test('handleMCP lists all 12 tools via tools/list', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await sendMCPRequest(port, 'tools/list', {}, 2);
    assert.equal(res.statusCode, 200);
    const result = parseSSEResult(res.body);
    const toolNames = result.result.tools.map((t: any) => t.name);
    assert.equal(toolNames.length, 12);
    assert.deepEqual(toolNames, [
      'getKilotestOverview',
      'listPages',
      'listIssues',
      'listViolators',
      'listDiagnoses',
      'getReport',
      'requestNewTest',
      'requestRetest',
      'requestFeature',
      'orderNewTest',
      'orderRetest',
      'awaitTest'
    ]);
  }
  finally {
    await closeMCPServer(server);
  }
});

test('handleMCP executes listPages tool via tools/call', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await sendMCPRequest(port, 'tools/call', {
      name: 'listPages',
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

test('handleMCP rejects a GET request with a 405 JSON-RPC error', async () => {
  const server = await startMCPServer();
  try {
    const port = server.address().port;
    const res = await new Promise<any>((resolve, reject) => {
      const req = http.request({
        port,
        method: 'GET',
        path: '/mcp',
        headers: {accept: 'application/json, text/event-stream'}
      }, response => {
        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => resolve({statusCode: response.statusCode, body: data}));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.statusCode, 405);
    const message = JSON.parse(res.body);
    assert.equal(message.error.code, -32000);
  }
  finally {
    await closeMCPServer(server);
  }
});
