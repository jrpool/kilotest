/*
  mcp.js
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
*/

// IMPORTS

const {McpServer} = require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z} = require('zod');
const {isReportAvailable, isURL} = require('./util');
const targetsAPI = require('./targets/api');
const reportIssuesAPI = require('./reportIssues/api');
const testRecFormAPI = require('./testRecForm/api');

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
const createMCPServer = () => {
  const server = new McpServer({name: 'Kilotest', version: '1.0.0'});
  server.registerTool(
    'summarizeQualityOfAllTestedWebPages',
    {
      description: 'Returns summary data from every available Kilotest report about the front-end quality (i.e. accessibility, usability, and standard conformity) of a web page. Before calling describeQualityIssuesOfOneWebPage, call this tool to check whether a report about the page is available.',
      inputSchema: {},
      annotations: {
        title: 'Summarize quality of all tested web pages',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await targetsAPI.response();
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'describeQualityOfOneWebPage',
    {
      description: 'Returns data from a specified Kilotest report about issues of front-end quality (i.e. accessibility, usability, and standard conformity) of a web page. The required timeStamp and jobID parameters identify the report and are obtained from a summarizeQualityOfAllTestedWebPages response.',
      inputSchema: {
        timeStamp: z.string().describe('Report timestamp in YYMMDDTHHMM format, e.g. 260503T0432'),
        jobID: z.string().describe('Job identifier, e.g. x9z')
      },
      annotations: {
        title: 'Describe the quality of one web page',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({timeStamp, jobID}) => {
      const result = await reportIssuesAPI.response([timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'recommendQualityTestingOfOneWebPage',
    {
      description: 'Recommends a web page for Kilotest to test for front-end quality (i.e. accessibility, usability, and standard conformity). Do not call this tool unless summarizeQualityOfAllTestedWebPages discloses that no report about the page or a related page that satisfies your requirements is available.',
      inputSchema: {
        what: z.string().describe('Short description of the page, following the naming conventions visible in the summarizeQualityOfAllTestedWebPages response'),
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
