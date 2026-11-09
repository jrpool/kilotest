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
import * as listSitesAPI from './api/listSites.ts';
import * as listIssuesAPI from './api/listIssues.ts';
import * as listViolatorsAPI from './api/listViolators.ts';
import * as listDiagnosesAPI from './api/listDiagnoses.ts';
import * as requestNewTestAPI from './api/requestNewTest.ts';
import * as requestRetestAPI from './api/requestRetest.ts';
import * as requestFeatureAPI from './api/requestFeature.ts';
import * as awaitTestAPI from './api/awaitTest.ts';
import * as questionDiagnosisAPI from './api/questionDiagnosis.ts';
import {version} from './api/version.ts';
import {recordMetric} from './util.ts';
import {collectionDescription, sharedContext} from './content.ts';

import {
  getReportSchema,
  listIssuesSchema,
  listViolatorsSchema,
  listDiagnosesSchema,
  listPagesSchema,
  requestNewTestSchema,
  requestRetestSchema,
  requestFeatureSchema,
  awaitTestSchema,
  questionDiagnosisSchema,
  listSitesResponseSchema,
  listPagesResponseSchema,
  listIssuesResponseSchema,
  listViolatorsResponseSchema,
  listDiagnosesResponseSchema,
  getReportResponseSchema,
  requestNewTestResponseSchema,
  requestRetestResponseSchema,
  requestFeatureResponseSchema,
  awaitTestResponseSchema,
  questionDiagnosisResponseSchema
} from './api/schemas.ts';

// CONSTANTS

export const mcpPath = '/mcp';

// Detailed overview of the Kilotest domain, data hierarchy, and tool workflow, returned by
// the getKilotestOverview tool and served as the docs://kilotest/overview resource.
const kilotestOverview = [
  sharedContext,
  'Results are organized as a hierarchy: tested sites; for each tested site, its tested pages; for each tested page, reports from the tests of the page; for each report, issues reported; for each issue, violators of rules belonging to the issue (a violator is an element or the whole page); for each violator, diagnoses by rule engines of its violations.',
  'Typical workflow: call the listSites tool to learn whether the site of the page has been tested. If it has, call the listPages tool with the site identifier to learn whether the page has been tested. If it has, drill down from its latest report with the listIssues, listViolators, and listDiagnoses tools, or retrieve the entire report with the getReport tool. The listIssues output also lists all reports about the same page, so you can examine earlier reports. If the page has not been tested, request a test with the requestNewTest tool, giving the site identifier as siteID if the site has been tested, or otherwise the site name as siteName. If the latest report is obsolete, request a retest with the requestRetest tool.',
  'The requestNewTest and requestRetest tools take a reviewImmediately parameter: set it to true for immediate review with immediate approval or rejection and immediate enqueueing if approved, or to false to queue the request for review by management. A request for immediate review of a page that may already have been tested (possible duplicates or similar sites) is referred to management review, and the response lists the pages and sites concerned, whose results may already answer your question. Immediate approval produces a report identifier and an opportunity to wait for completion. To wait, call the awaitTest tool with that identifier; it blocks until the report is ready, the job fails, or a maximum wait time elapses. To check later instead, call the listIssues tool with the same identifier.',
  'More documentation is available at https://kilotest.com/llms.txt and https://kilotest.com/llms-full.txt.'
].join('\n\n');

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
export const createMCPServer = (): McpServer => {
  const server = new McpServer({
    name: 'Kilotest',
    version,
    description: collectionDescription
  },
  {
    instructions: `${sharedContext} Use the listSites tool to start, and then the listPages tool for the site of the page you want facts about. If the page has been tested, drill down from its latest report with the listIssues, listViolators, and listDiagnoses tools. If not, use the requestNewTest tool to request that the page be tested, giving the site identifier as siteID if the site has been tested or otherwise the site name as siteName, and setting its reviewImmediately parameter to true for immediate review. If the latest report about the page is obsolete, use the requestRetest tool the same way. For detailed documentation, call the getOverview tool.`
  });
  server.registerTool(
    'getOverview',
    {
      description: 'Explains what Kilotest is, what its tools do, and how its results are structured. Use this before any other tool when the available tools or workflow are unclear; it is unnecessary once you know which tool you need. Returns a prose overview of the Kilotest domain, the tool workflow, and links to further documentation. Kilotest tests web pages for front-end quality with an ensemble of rule engines.',
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
      await recordMetric('mcpToolCalls', 'getOverview');
      return {content: [{type: 'text', text: kilotestOverview}]};
    }
  );
  server.registerTool(
    'listSites',
    {
      description: 'Lists all sites of which Kilotest has tested pages. Use this first to discover whether the site of a page has been tested, and then listPages with the site identifier to discover whether the page has been tested, before requesting a test. Returns, for each tested site, its identifier, name, and count of tested pages. Entries are sorted by site name and are not paginated.',
      inputSchema: {},
      outputSchema: listSitesResponseSchema,
      annotations: {
        title: 'List tested sites',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const result = await listSitesAPI.response();
      await recordMetric('mcpToolCalls', 'listSites');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listPages',
    {
      description: 'Lists the tested pages of one site. Use this after listSites to discover whether a page of the site already has any reports before requesting a test. The siteID comes from listSites; an unknown or malformed one produces an error. Returns, for each tested page of the site, its identifier, name, URL, sites, and the identifier of its latest available report. Entries are sorted by page name and are not paginated.',
      inputSchema: listPagesSchema,
      outputSchema: listPagesResponseSchema,
      annotations: {
        title: 'List the tested pages of a site',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({siteID}) => {
      const result = await listPagesAPI.response([siteID]);
      await recordMetric('mcpToolCalls', 'listPages');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'listIssues',
    {
      description: 'Lists the issues reported in one report, along with the history of all reports about the same page. Use this after listPages to begin examining the latest report about a page, or to switch to an earlier or later report or to begin examining this report. The reportID is the latest report’s identifier from listPages or an earlier identifier from the history this tool returns. Returns the history and the basics about this report’s issues, sorted by summary and not paginated; an unknown or malformed reportID produces an error. The returned issue identifiers are inputs to the listViolators tool. Use getReport instead when the entire report is needed in one call.',
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
      description: 'Lists the elements of a tested page that were reported as exhibiting one issue in one report. Use this after listIssues to drill down from an issue to the elements violating rules belonging to that issue; the issueID must be one of the issue identifiers listIssues returned for the same reportID; call listIssues first if you do not have an issueID. Returns basics about each violating element, sorted by catalog index and not paginated; an unknown issueID or reportID produces an error.',
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
      description: 'Lists the diagnoses that rule engines gave for how one element exhibited one issue in one report. Use this after listViolators to get details about the element as a violator of the issue; the catalogIndex is the element’s identifier in the listViolators output for that issue and report. Use getReport instead when all diagnoses in the report are needed at once. Returns, for each rule engine that reported a violation by the element of a rule belonging to the issue, the diagnosis given by the rule engine; an unknown report, issue, or element produces an error.',
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
    async ({issueID, reportID, catalogIndex}) => {
      const result = await listDiagnosesAPI.response([issueID, reportID, catalogIndex]);
      await recordMetric('mcpToolCalls', 'listDiagnoses');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'questionDiagnosis',
    {
      description: 'Questions or contests a diagnosis shown by the listDiagnoses tool; queued for review by management. Use this after listDiagnoses when you believe a rule violation was incorrectly diagnosed or classified into an issue, providing the issueID, reportID, catalogIndex, engineID, and ruleID shown in the diagnosis and your reason. No authorization is required; a nonexistent report, element, or diagnosis produces an error. Returns a confirmation with disposition details.',
      inputSchema: questionDiagnosisSchema,
      outputSchema: questionDiagnosisResponseSchema,
      annotations: {
        title: 'Question a diagnosis',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({issueID, reportID, catalogIndex, engineID, ruleID, reason}) => {
      const result = await questionDiagnosisAPI.response([issueID, reportID, catalogIndex, engineID, ruleID, reason]);
      await recordMetric('mcpToolCalls', 'questionDiagnosis');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'getReport',
    {
      description: 'Retrieves one entire report as JSON, with all of its issues, violators, and diagnoses. Use this instead of drilling down through listIssues, listViolators, and listDiagnoses when the full report is needed in one call; for only part of a report, drill down with those tools instead. The reportID comes from listPages or from the report history that listIssues returns, and an unknown or malformed one produces an error. The report can exceed 1 MB; its exact size is disclosed by the listIssues tool.',
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
      description: 'Submits a request to test a page that has no report yet. Identify its site with siteID if the site is in the listSites output (check the listPages output for that site first), or otherwise name the site with siteName; give exactly one of them. Set reviewImmediately to true for immediate review with immediate approval or rejection and immediate enqueueing if approved (testing then typically takes 2 to 4 minutes); set it to false to queue the request for review by management, which typically takes 1 hour to 1 day. The pageName becomes the name of the page in later listPages output and must differ from the names of the other pages of the site; a siteName becomes the name of a new site and must not match the name of a tested site (ignoring case, white space, and punctuation). The reason is what the reviewer evaluates. A request for immediate review of a page that may already have been tested is referred to management review, and the disposition lists the possible duplicates and similar sites. A refusal, such as a duplicate request or a full queue, is reported in the disposition. Returns a confirmation with disposition details, including, on immediate approval, a report identifier and a question about whether to wait for completion with the awaitTest tool.',
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
    async ({siteID = '', siteName = '', pageName, URL, reason, reviewImmediately = false}) => {
      const result = await requestNewTestAPI.response([siteID, siteName, pageName, URL, reason, String(reviewImmediately === true)]);
      await recordMetric('mcpToolCalls', 'requestNewTest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestRetest',
    {
      description: 'Submits a request to retest a page whose existing report is considered obsolete. Set reviewImmediately to true for immediate review with immediate approval or rejection and immediate enqueueing if approved (testing then typically takes 2 to 4 minutes); set it to false to queue the request for review by management, which typically takes 1 hour to 1 day. The reportID must belong to the page’s latest report and the reason is what the reviewer evaluates. A refusal, such as a superseded report, a duplicate request, or a full queue, is reported in the disposition. Returns a confirmation with disposition details, including, on immediate approval, a report identifier and a question about whether to wait for completion with the awaitTest tool.',
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
    async ({reportID, reason, reviewImmediately = false}) => {
      const result = await requestRetestAPI.response([reportID, reason, String(reviewImmediately === true)]);
      await recordMetric('mcpToolCalls', 'requestRetest');
      return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result};
    }
  );
  server.registerTool(
    'requestFeature',
    {
      description: 'Submits a request to add a new feature or improve an existing one; queued for review by management. Use questionDiagnosis instead to question a specific diagnosis shown by listDiagnoses. The feature text describes the proposed feature or improvement. A request identical to one awaiting review is refused, and otherwise the disposition confirms the request was logged and the manager notified. Returns a request confirmation with disposition details.',
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
    'awaitTest',
    {
      description: 'Waits for a job that a requestNewTest or requestRetest call with reviewImmediately set to true ordered, using the report identifier that call returned. Use this instead of polling listIssues when an immediate answer is preferred. The reportID identifies a pending or in-progress job and remains the finished report’s identifier for listIssues and getReport. Blocks until the report is ready, the job fails, or a maximum wait time elapses (5 minutes by default), sending no interim notices; returns the finished job’s status and, if ready, its report identifier.',
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
