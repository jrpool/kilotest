/*
  mcp.js
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
*/

// IMPORTS

const {McpServer} = require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport} = require(
  '@modelcontextprotocol/sdk/server/streamableHttp.js'
);
const {z} = require('zod');
const {isReportAvailable, isURL} = require('./util');
const targetAPI = require('./target/api');
const reportListAPI = require('./reportList/api');
const reportSummaryAPI = require('./reportSummary/api');
const reportIssueAPI = require('./reportIssue/api');
const testRecFormAPI = require('./testRecForm/api');

// CONSTANTS

exports.mcpPath = '/mcp';

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
const createMCPServer = () => {
  const server = new McpServer({name: 'Kilotest', version: '1.0.0'});
  server.registerTool(
    'summarizeQualityOfMatchingWebPages',
    {
      description: 'Returns summary data from every available Kilotest report about the front-end quality (i.e. accessibility, usability, and standards conformity) of web pages that match the description or hostname fragment of a web page that you have provided. Matching is case-insensitive and succeeds if the page property either is included by or includes the specified fragment.',
      inputSchema: {
        description: z.string().describe('All or part of a description of the web page.'),
        hostname: z.string().describe('All or part of the hostname of the URL of the web page.')
      },
      annotations: {
        title: 'Summarize the quality of matching web pages',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({description, hostname}) => {
      const result = await targetAPI.response([description, hostname]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'listAllAvailableReports',
    {
      description: 'Returns a list of all available Kilotest reports; each report describes the results of a job that tested one web page for front-end quality (i.e. accessibility, usability, and standards conformity).',
      inputSchema: {},
      annotations: {
        title: 'List all available reports',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await reportListAPI.response();
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'summarizeOneReport',
    {
      description: 'Returns a summary of a specified Kilotest report about the front-end quality (i.e. accessibility, usability, and standards conformity) of a web page. The required timeStamp and jobID parameters identify the report and are obtained from a listAllAvailableReports response.',
      inputSchema: {
        timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHMM format, e.g. 260503T0432'),
        jobID: z.string().describe('Job identifier, e.g. x9z')
      },
      annotations: {
        title: 'Summarize one report',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await reportSummaryAPI.response([timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'describeOneIssueFromOneReport',
    {
      description: 'Returns data from a specified Kilotest report about one of the issues for the front-end quality (i.e. accessibility, usability, and standards conformity) of a web page. The required issueID, timeStamp, and jobID parameters identify the issue and the report and are obtained from a summarizeOneReport response.',
      inputSchema: {
        issueID: z.string().describe('Issue identifier, e.g. contrastPoor'),
        timeStamp: z.string().describe('Report timestamp in YYMMDDTHHMM format, e.g. 260503T0432'),
        jobID: z.string().describe('Job identifier, e.g. x9z')
      },
      annotations: {
        title: 'Describe one issue from one report',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({issueID, timeStamp, jobID}) => {
      const result = await reportIssueAPI.response([issueID, timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'recommendQualityTestingOfOneWebPage',
    {
      description: 'Recommends a web page for Kilotest to test for front-end quality (i.e. accessibility, usability, and standards conformity). Do not call this tool until after you call listAllAvailableReports to check whether a report about the page, or a related page that satisfies your requirements, is available and to understand the naming conventions for pages.',
      inputSchema: {
        what: z.string().describe('Short description of the page, following the naming conventions visible in the listAllAvailableReports response'),
        url: z.string().describe('Full HTTPS URL of the page to test'),
        why: z.string().describe('Reason for recommending this page for testing')
      },
      annotations: {
        title: 'Recommend quality testing of one web page',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({what, url, why}) => {
      if (!isURL(url)) {
        return {content: [{type: 'text', text: JSON.stringify({error: 'Invalid URL'})}], isError: true};
      }
      if (await isReportAvailable(what, url)) {
        return {content: [{type: 'text', text: JSON.stringify({error: 'A report about the page is already available'})}], isError: true};
      }
      const result = await testRecFormAPI.response(what, url, why);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
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
