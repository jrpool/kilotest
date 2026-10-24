/*
  mcp.ts
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
*/

// IMPORTS

import type {IncomingMessage, ServerResponse} from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as getReportAPI from './api/getReport.ts';
import * as listPagesAPI from './api/listPages.ts';
import * as listIssuesAPI from './api/listIssues.ts';
import * as listViolatorsAPI from './api/listViolators.ts';
import * as listDiagnosesAPI from './api/listDiagnoses.ts';
import * as requestNewTestAPI from './api/requestNewTest.ts';
import * as requestRetestAPI from './api/requestRetest.ts';
import * as requestFeatureAPI from './api/requestFeature.ts';
import * as orderNewTestAPI from './api/orderNewTest.ts';
import * as orderRetestAPI from './api/orderRetest.ts';
import * as awaitTestAPI from './api/awaitTest.ts';
import {version} from './api/version.ts';
import {recordMetric} from './util.ts';

import {
  getReportSchema,
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  requestNewTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  orderNewTestSchema,
  orderRetestSchema,
  awaitTestSchema,
  listPagesResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestNewTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema,
  orderNewTestResponseSchema,
  orderRetestResponseSchema,
  awaitTestResponseSchema
} from './api/schemas.ts';

// CONSTANTS

export const mcpPath = '/mcp';

// Shared statement of the Kilotest domain and data hierarchy, repeated in the server
// instructions and in the getKilotestOverview tool description (but not in the other tool
// descriptions, to avoid diluting how models read each tool), because some MCP clients do
// not propagate server-level instructions or the server description to their models.
const sharedContext = 'Kilotest integrates an ensemble of 12 rule engines, with about 1,300 rules, to test web pages for front-end quality (accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG). Each test job generates a standardized report describing which elements violated which rules and grouping the violations into about 380 issues. Kilotest can list the tested pages, the reports about each page, the issues in each report, the violators of each issue, and the diagnoses of each violation. Kilotest also accepts requests to test pages not yet tested and to retest already tested pages.';

// Detailed overview of the Kilotest domain, data hierarchy, and tool workflow, returned by
// the getKilotestOverview tool and served as the docs://kilotest/overview resource.
const kilotestOverview = [
  'Kilotest tests web pages for front-end quality: accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG.',
  'Kilotest integrates an ensemble of twelve independent rule engines to test a web page and stores the results as a structured report.',
  'Results are organized as a hierarchy: tested pages; for each tested page, reports from the tests of the page; for each report, issues reported; for each issue, violators of rules belonging to the issue (a violator is an element or the whole page); for each violator, diagnoses by rule engines of its violations.',
  'Typical workflow: call the listPages tool to learn whether the page has been tested. If it has, drill down from its latest report with the listIssues, listViolators, and listDiagnoses tools, or retrieve the entire report with the getReport tool. The listIssues output also lists all reports about the same page, so you can examine earlier reports. If the page has not been tested, request a test with the requestNewTest tool or order a test with the orderNewTest tool. If the latest report is obsolete, request a retest with the requestRetest tool or order a retest with the orderRetest tool.',
  'The request tools submit requests for manager approval. The order tools obtain automated review and approval or rejection. Approval produces a report identifier and an opportunity to wait for completion. To wait, call the awaitTest tool with that identifier; it blocks until the report is ready, the job fails, or a maximum wait time elapses. To check later instead, call the listIssues tool with the same identifier.',
  'More documentation is available at https://kilotest.com/llms.txt and https://kilotest.com/llms-full.txt.'
].join('\n\n');

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
export const createMCPServer = (): McpServer => {
  const server = new McpServer({
    name: 'Kilotest',
    version,
    description: 'Tools that test web pages for front-end quality (accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG) and make test results available'
  },
  {
    instructions: `${sharedContext} Use the listPages tool to start. If it shows that the page you want facts about has been tested, drill down from its latest report with the listIssues, listViolators, and listDiagnoses tools. If not, use the requestNewTest tool to request that the page be tested, or the orderNewTest tool for immediate, automatically approved testing. If the latest report about the page is obsolete, use the requestRetest tool to request that the page be retested, or the orderRetest tool for immediate, automatically approved retesting. For detailed documentation, call the getKilotestOverview tool.`
  });
  server.registerTool(
    'getKilotestOverview',
    {
      description: `Explains what Kilotest is, what its tools do, and how its results are structured. Use this before any other tool when the available tools or workflow are unclear. Returns a prose overview of the Kilotest domain, the tool workflow, and links to further documentation. ${sharedContext}`,
      inputSchema: {},
      annotations: {
        title: 'Explain Kilotest and its tools',
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
    'listPages',
    {
      description: 'Lists all pages Kilotest has tested. Use this first to discover whether a page already has any reports before requesting a test. Returns, for each tested page, its description, URL, and the identifier of its latest available report.',
      inputSchema: {},
      outputSchema: listPagesResponseSchema,
      annotations: {
        title: 'List tested pages',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await listPagesAPI.response();
      await recordMetric('mcpToolCalls', 'listPages');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listIssues',
    {
      description: 'Lists the issues reported in one report, along with the history of all reports about the same page. Use this after listPages to switch to an earlier or later report or to begin examining this report. Returns the history and the basics about this report’s issues.',
      inputSchema: listIssuesSchema,
      outputSchema: listIssuesResponseSchema,
      annotations: {
        title: 'List issues in a report',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({reportID}) => {
      const result = await listIssuesAPI.response([reportID]);
      await recordMetric('mcpToolCalls', 'listIssues');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listViolators',
    {
      description: 'Lists the elements of a tested page that were reported as exhibiting one issue in one report. Use this after listIssues to drill down from an issue to the elements violating rules belonging to that issue. Returns basics about each violating element.',
      inputSchema: listViolatorsSchema,
      outputSchema: listViolatorsResponseSchema,
      annotations: {
        title: 'List elements exhibiting an issue',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({issueID, reportID}) => {
      const result = await listViolatorsAPI.response([issueID, reportID]);
      await recordMetric('mcpToolCalls', 'listViolators');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listDiagnoses',
    {
      description: 'Lists the diagnoses that rule engines gave for how one element exhibited one issue in one report. Use this after listViolators to get details about the element as a violator of the issue. Returns, for each rule engine that reported a violation by the element of a rule belonging to the issue, the diagnosis given by the rule engine.',
      inputSchema: listDiagnosesSchema,
      outputSchema: listDiagnosesResponseSchema,
      annotations: {
        title: 'List diagnoses of a violation',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({catalogIndex, issueID, reportID}) => {
      const result = await listDiagnosesAPI.response([catalogIndex, issueID, reportID]);
      await recordMetric('mcpToolCalls', 'listDiagnoses');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'getReport',
    {
      description: 'Retrieves one entire report as JSON, with all of its issues, violators, and diagnoses. Use this instead of drilling down through listIssues, listViolators, and listDiagnoses when the full report is needed in one call. Returns the complete report data for the specified report identifier. The size of the report is disclosed by the listIssues tool.',
      inputSchema: getReportSchema,
      outputSchema: getReportResponseSchema,
      annotations: {
        title: 'Get a full report',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({reportID}) => {
      const result = await getReportAPI.response([reportID]);
      await recordMetric('mcpToolCalls', 'getReport');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestNewTest',
    {
      description: 'Submits a request to test a page that has no report yet; queued for manager approval. Use orderNewTest instead for immediate, automatically approved testing. Returns a request confirmation with disposition details.',
      inputSchema: requestNewTestSchema,
      outputSchema: requestNewTestResponseSchema,
      annotations: {
        title: 'Request testing of a new page',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({description, URL, reason}) => {
      const result = await requestNewTestAPI.response([description, URL, reason]);
      await recordMetric('mcpToolCalls', 'requestNewTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestRetest',
    {
      description: 'Submits a request to retest a page whose existing report is considered obsolete; queued for manager approval. Use orderRetest instead for immediate, automatically approved retesting. Returns a request confirmation with disposition details.',
      inputSchema: requestRetestSchema,
      outputSchema: requestRetestResponseSchema,
      annotations: {
        title: 'Request a retest',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({reportID, reason}) => {
      const result = await requestRetestAPI.response([reportID, reason]);
      await recordMetric('mcpToolCalls', 'requestRetest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestFeature',
    {
      description: 'Submits a request to add a new feature or improve an existing one; queued for manager review. There is no immediate-approval alternative for feature requests. Returns a request confirmation with disposition details.',
      inputSchema: requestFeatureSchema,
      outputSchema: requestFeatureResponseSchema,
      annotations: {
        title: 'Request a feature',
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
    'orderNewTest',
    {
      description: 'Orders testing of a page that has no report yet, with automated approval or rejection and immediate enqueueing if approved. Use this instead of requestNewTest when immediate testing is wanted; testing typically takes 2 to 4 minutes. Returns an order confirmation and disposition details, including, if approved, a report identifier and a question about whether to wait for completion with the awaitTest tool.',
      inputSchema: orderNewTestSchema,
      outputSchema: orderNewTestResponseSchema,
      annotations: {
        title: 'Order immediate testing of a new page',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({description, URL, reason}) => {
      const result = await orderNewTestAPI.response([description, URL, reason]);
      await recordMetric('mcpToolCalls', 'orderNewTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'orderRetest',
    {
      description: 'Orders a retest of a page whose existing report is considered obsolete, with automated approval or rejection and immediate enqueuing if approved. Use this instead of requestRetest when immediate retesting is wanted; testing typically takes 2 to 4 minutes. Returns an order confirmation and disposition details, including, if approved, a report identifier and a question about whether to wait for completion with the awaitTest tool.',
      inputSchema: orderRetestSchema,
      outputSchema: orderRetestResponseSchema,
      annotations: {
        title: 'Order an immediate retest',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async ({reportID, reason}) => {
      const result = await orderRetestAPI.response([reportID, reason]);
      await recordMetric('mcpToolCalls', 'orderRetest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'awaitTest',
    {
      description: 'Waits for a job ordered via the orderNewTest or orderRetest tool to finish, using the report identifier either tool returned. Use this instead of polling listIssues when an immediate answer is preferred. Blocks until the report is ready, the job fails, or a maximum wait time elapses, sending no interim notices; returns the finished job’s status and, if ready, its report identifier.',
      inputSchema: awaitTestSchema,
      outputSchema: awaitTestResponseSchema,
      annotations: {
        title: 'Wait for an ordered job to finish',
        readOnlyHint: true,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({reportID}) => {
      const result = await awaitTestAPI.response([reportID]);
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
