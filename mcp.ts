/*
  mcp.ts
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
*/

// IMPORTS

import type {IncomingMessage, ServerResponse} from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as getReportAPI from './api/getReport.ts';
import * as listReportsAPI from './api/listReports.ts';
import * as listIssuesAPI from './api/listIssues.ts';
import * as listViolatorsAPI from './api/listViolators.ts';
import * as listDiagnosesAPI from './api/listDiagnoses.ts';
import * as requestTestAPI from './api/requestTest.ts';
import * as requestRetestAPI from './api/requestRetest.ts';
import * as requestFeatureAPI from './api/requestFeature.ts';
import * as orderTestAPI from './api/orderTest.ts';
import * as orderRetestAPI from './api/orderRetest.ts';
import * as awaitTestAPI from './api/awaitTest.ts';
import {version} from './api/version.ts';
import {recordMetric} from './util.ts';

import {
  getReportSchema,
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  requestTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  orderTestSchema,
  orderRetestSchema,
  awaitTestSchema,
  listReportsResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema,
  orderTestResponseSchema,
  orderRetestResponseSchema,
  awaitTestResponseSchema
} from './api/schemas.ts';

// CONSTANTS

export const mcpPath = '/mcp';

// Shared statement of the Kilotest domain and data hierarchy, repeated in every tool
// description, in the server instructions, and in the getKilotestOverview tool description,
// because some MCP clients do not propagate server-level instructions or the server
// description to their models.
const sharedContext = 'Kilotest tests web pages for front-end quality (accessibility, usability, and standards conformity); results are organized as report, then issue, then violator element, then diagnosis.';

// Detailed overview of the Kilotest domain, data hierarchy, and tool workflow, returned by
// the getKilotestOverview tool and served as the docs://kilotest/overview resource.
const kilotestOverview = [
  'Kilotest tests web pages for front-end quality: accessibility, usability, and standards conformity.',
  'Kilotest integrates an ensemble of twelve independent rule engines to test a web page and stores the results as a structured report.',
  'Results are organized as a hierarchy. A report contains issues. An issue has violators: elements of the tested page reported as exhibiting the issue. A violator has diagnoses: explanations from rule engines of how the element exhibited the issue.',
  'Typical workflow: call the listReports tool to learn whether a report about the page already exists. If it does, drill down with the listIssues, listViolators, and listDiagnoses tools, or retrieve the entire report with the getReport tool. If no report exists, request a test with the requestTest tool. If the latest report is obsolete, request a retest with the requestRetest tool.',
  'For immediate, automatically approved testing, use the orderTest tool (for a new page) or the orderRetest tool (for a page with an obsolete report) instead of requestTest or requestRetest. Each enqueues the job right away, with no manual approval step, and returns a report identifier along with a question about whether to wait for completion. To wait, call the awaitTest tool with that identifier; it blocks until the report is ready, the job fails, or a maximum wait time elapses. To check later instead, call the listIssues tool with the same identifier.',
  'More documentation is available at https://kilotest.com/llms.txt and https://kilotest.com/llms-full.txt.'
].join('\n\n');

// FUNCTIONS

// Returns a tool description consisting of the tool-specific summary followed by the shared
// Kilotest domain context.
const toolDoc = (summary: string): string => `${summary} ${sharedContext}`;

// Creates and returns an McpServer with Kilotest tools registered.
export const createMCPServer = (): McpServer => {
  const server = new McpServer({
    name: 'Kilotest',
    version,
    description: 'Tools that test web pages for front-end quality (accessibility, usability, and standards conformity) and make test results available'
  },
  {
    instructions: `${sharedContext} Use the listReports tool to start. If it shows that there is a report available about the page you want facts about, drill down with the listIssues, listViolators, and listDiagnoses tools. If not, use the requestTest tool to request that the page be tested, or the orderTest tool for immediate, automatically approved testing. If the latest report about the page is obsolete, use the requestRetest tool to request that the page be retested, or the orderRetest tool for immediate, automatically approved retesting. For detailed documentation, call the getKilotestOverview tool.`
  });
  server.registerTool(
    'getKilotestOverview',
    {
      description: toolDoc('Explain what Kilotest is, what its tools do, and how its results are structured.'),
      inputSchema: {},
      annotations: {
        title: toolDoc('Explain what Kilotest is, what its tools do, and how its results are structured.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      await recordMetric('mcpToolCalls', 'getKilotestOverview');
      return {content: [{type: 'text', text: kilotestOverview}]};
    }
  );
  server.registerTool(
    'listReports',
    {
      description: toolDoc('Provide basics about all available reports.'),
      inputSchema: {},
      outputSchema: listReportsResponseSchema,
      annotations: {
        title: toolDoc('Provide basics about all available reports.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await listReportsAPI.response();
      await recordMetric('mcpToolCalls', 'listReports');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listIssues',
    {
      description: toolDoc('Provide details about one report, including basics about the issues reported in it.'),
      inputSchema: listIssuesSchema,
      outputSchema: listIssuesResponseSchema,
      annotations: {
        title: toolDoc('Provide details about one report, including basics about the issues reported in it.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await listIssuesAPI.response([timeStamp, jobID]);
      await recordMetric('mcpToolCalls', 'listIssues');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listViolators',
    {
      description: toolDoc('Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.'),
      inputSchema: listViolatorsSchema,
      outputSchema: listViolatorsResponseSchema,
      annotations: {
        title: toolDoc('Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({issueID, timeStamp, jobID}) => {
      const result = await listViolatorsAPI.response([issueID, timeStamp, jobID]);
      await recordMetric('mcpToolCalls', 'listViolators');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listDiagnoses',
    {
      description: toolDoc('Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.'),
      inputSchema: listDiagnosesSchema,
      outputSchema: listDiagnosesResponseSchema,
      annotations: {
        title: toolDoc('Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({catalogIndex, issueID, timeStamp, jobID}) => {
      const result = await listDiagnosesAPI.response([catalogIndex, issueID, timeStamp, jobID]);
      await recordMetric('mcpToolCalls', 'listDiagnoses');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'getReport',
    {
      description: toolDoc('Get one full report in JSON.'),
      inputSchema: getReportSchema,
      outputSchema: getReportResponseSchema,
      annotations: {
        title: toolDoc('Get one full report in JSON.'),
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await getReportAPI.response([timeStamp, jobID]);
      await recordMetric('mcpToolCalls', 'getReport');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestTest',
    {
      description: toolDoc('Process my request to test a page about which no report is available yet.'),
      inputSchema: requestTestSchema,
      outputSchema: requestTestResponseSchema,
      annotations: {
        title: toolDoc('Process my request to test a page about which no report is available yet.'),
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({description, URL, reason}) => {
      const result = await requestTestAPI.response([description, URL, reason]);
      await recordMetric('mcpToolCalls', 'requestTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestRetest',
    {
      description: toolDoc('Process my request to retest a page about which a report is available.'),
      inputSchema: requestRetestSchema,
      outputSchema: requestRetestResponseSchema,
      annotations: {
        title: toolDoc('Process my request to retest a page about which a report is available.'),
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID, reason}) => {
      const result = await requestRetestAPI.response([timeStamp, jobID, reason]);
      await recordMetric('mcpToolCalls', 'requestRetest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestFeature',
    {
      description: toolDoc('Process my request to add or improve a feature.'),
      inputSchema: requestFeatureSchema,
      outputSchema: requestFeatureResponseSchema,
      annotations: {
        title: toolDoc('Process my request to add or improve a feature.'),
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({feature}) => {
      const result = await requestFeatureAPI.response([feature]);
      await recordMetric('mcpToolCalls', 'requestFeature');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'orderTest',
    {
      description: toolDoc('Process my order to test a page about which no report is available yet, immediately and automatically approved, instead of waiting for manual approval. Testing typically takes about 2 minutes and occasionally up to 4 minutes.'),
      inputSchema: orderTestSchema,
      outputSchema: orderTestResponseSchema,
      annotations: {
        title: toolDoc('Process my order to test a page about which no report is available yet, immediately and automatically approved.'),
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({description, URL, reason}) => {
      const result = await orderTestAPI.response([description, URL, reason]);
      await recordMetric('mcpToolCalls', 'orderTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'orderRetest',
    {
      description: toolDoc('Process my order to retest a page immediately and automatically approved, instead of waiting for manual approval. Testing typically takes about 2 minutes and occasionally up to 4 minutes.'),
      inputSchema: orderRetestSchema,
      outputSchema: orderRetestResponseSchema,
      annotations: {
        title: toolDoc('Process my order to retest a page immediately and automatically approved.'),
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID, reason}) => {
      const result = await orderRetestAPI.response([timeStamp, jobID, reason]);
      await recordMetric('mcpToolCalls', 'orderRetest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'awaitTest',
    {
      description: toolDoc('Wait for a job ordered via the orderTest tool to complete, using the report identifier orderTest returned. Blocks until the report is ready, the job fails, or a maximum wait time elapses; sends no interim notices.'),
      inputSchema: awaitTestSchema,
      outputSchema: awaitTestResponseSchema,
      annotations: {
        title: toolDoc('Wait for a job ordered via the orderTest tool to complete.'),
        readOnlyHint: true,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await awaitTestAPI.response([timeStamp, jobID]);
      await recordMetric('mcpToolCalls', 'awaitTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerResource(
    'kilotest-overview',
    'docs://kilotest/overview',
    {
      title: 'Kilotest overview',
      description: `What Kilotest is and how its tools and results are organized. ${sharedContext}`,
      mimeType: 'text/plain'
    },
    async () => ({
      contents: [{uri: 'docs://kilotest/overview', mimeType: 'text/plain', text: kilotestOverview}]
    })
  );
  return server;
};
// Handles an MCP request.
export const handleMCP = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  // If the request is not a POST request: reject it, because this stateless server has no sessions for GET-opened SSE streams or DELETE requests to act on, and leaving such streams open would leak resources.
  if (request.method !== 'POST') {
    response.writeHead(405, {allow: 'POST', 'content-type': 'application/json'});
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {code: -32000, message: 'Method Not Allowed: only POST requests are accepted'},
      id: null
    }));
    return;
  }
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
  const server = createMCPServer();
  await server.connect(transport);
  await transport.handleRequest(request, response);
};
