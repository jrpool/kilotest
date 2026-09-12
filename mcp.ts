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
import {version} from './api/version.ts';

import {
  getReportSchema,
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  requestTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  listReportsResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema
} from './api/schemas.ts';

// CONSTANTS

export const mcpPath = '/mcp';

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
export const createMCPServer = () => {
  const server = new McpServer({
    name: 'Kilotest',
    version,
    description: 'Tools that test web pages for front-end quality (accessibility, usability, and standards conformity) and make test results available'
  },
  {
    instructions: 'Use the listReports tool to start. If it shows that there is a report available about the page you want facts about, drill down with the listIssues, listViolators, and listDiagnoses tools. If not, use the requestTest tool to request that the page be tested. If the latest report about the page is obsolete, use the requestRetest tool to request that the page be retested.'
  });
  server.registerTool(
    'listReports',
    {
      description: 'Provide basics about all available reports.',
      inputSchema: {},
      outputSchema: listReportsResponseSchema,
      annotations: {
        title: 'Provide basics about all available reports.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await listReportsAPI.response();
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listIssues',
    {
      description: 'Provide details about one report, including basics about the issues reported in it.',
      inputSchema: listIssuesSchema,
      outputSchema: listIssuesResponseSchema,
      annotations: {
        title: 'Provide details about one report, including basics about the issues reported in it.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await listIssuesAPI.response([timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listViolators',
    {
      description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.',
      inputSchema: listViolatorsSchema,
      outputSchema: listViolatorsResponseSchema,
      annotations: {
        title: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({issueID, timeStamp, jobID}) => {
      const result = await listViolatorsAPI.response([issueID, timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listDiagnoses',
    {
      description: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.',
      inputSchema: listDiagnosesSchema,
      outputSchema: listDiagnosesResponseSchema,
      annotations: {
        title: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({catalogIndex, issueID, timeStamp, jobID}) => {
      const result = await listDiagnosesAPI.response([catalogIndex, issueID, timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'getReport',
    {
      description: 'Get one full report in JSON.',
      inputSchema: getReportSchema,
      outputSchema: getReportResponseSchema,
      annotations: {
        title: 'Get one full report in JSON.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await getReportAPI.response([timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestTest',
    {
      description: 'Process my request to test a page about which no report is available yet.',
      inputSchema: requestTestSchema,
      outputSchema: requestTestResponseSchema,
      annotations: {
        title: 'Process my request to test a page about which no report is available yet.',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({description, URL, reason}) => {
      const result = await requestTestAPI.response([description, URL, reason]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestRetest',
    {
      description: 'Process my request to retest a page about which a report is available.',
      inputSchema: requestRetestSchema,
      outputSchema: requestRetestResponseSchema,
      annotations: {
        title: 'Process my request to retest a page about which a report is available.',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID, reason}) => {
      const result = await requestRetestAPI.response([timeStamp, jobID, reason]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestFeature',
    {
      description: 'Process my request to add or improve a feature.',
      inputSchema: requestFeatureSchema,
      outputSchema: requestFeatureResponseSchema,
      annotations: {
        title: 'Process my request to add or improve a feature.',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({feature}) => {
      const result = await requestFeatureAPI.response([feature]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  return server;
};
// Handles an MCP request.
export const handleMCP = async (request: IncomingMessage, response: ServerResponse) => {
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
  const server = createMCPServer();
  await server.connect(transport);
  await transport.handleRequest(request, response);
};
