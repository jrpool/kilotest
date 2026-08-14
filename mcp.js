/*
  mcp.js
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
*/

// IMPORTS

const {McpServer} = require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport} = require(
  '@modelcontextprotocol/sdk/server/streamableHttp.js'
);
const getReportAPI = require('./api/getReport');
const listReportsAPI = require('./api/listReports');
const listIssuesAPI = require('./api/listIssues');
const listViolatorsAPI = require('./api/listViolators');
const listDiagnosesAPI = require('./api/listDiagnoses');
const requestTestAPI = require('./api/requestTest');
const requestRetestAPI = require('./api/requestRetest');
const requestFeatureAPI = require('./api/requestFeature');

const {
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
} = require('./api/schemas');

// CONSTANTS

exports.mcpPath = '/mcp';

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
const createMCPServer = () => {
  const server = new McpServer({
    name: 'Kilotest',
    version: '2.0.0',
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
    async ({request}) => {
      const result = await requestFeatureAPI.response([request]);
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  return server;
};
// Handles an MCP request.
exports.handleMCP = async (request, response) => {
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
  const server = createMCPServer();
  await server.connect(transport);
  await transport.handleRequest(request, response);
};
