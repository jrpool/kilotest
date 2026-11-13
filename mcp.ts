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
// The largest accepted request body, matching the MCP SDK transport’s own limit.
const maxBodyBytes = 4 * 1024 * 1024;

// Detailed overview of the Kilotest domain, data hierarchy, and tool workflow, returned by the getOverview tool and served as the docs://kilotest/overview resource.
const kilotestOverview = [
  sharedContext,
  'Typical workflow: Suppose a user wants information about the quality of a website or a particular website page. Call listSites to learn whether the site has been tested. If it has, call listPages to learn which pages of the site have been tested. To get test results for any of those pages, drill down as far as needed to satisfy the user, calling listIssues, listViolators, and/or listDiagnoses. If the full machine-oriented JSON report is wanted for analysis outside of Kilotest, call getReport instead of listIssues, listViolators, or listDiagnoses.',
  'Requesting more testing: If needed results have not been published, you can call requestNewTest or, for a page with published but outdated results, requestRetest. For both tools, if you set the optional reviewImmediately parameter to true, then your request is immediately reviewed, and, if approved, you can optionally await test completion (typically in 2 to 4 minutes) by calling awaitTest. If reviewImmediately is false or absent, review and, on approval, testing typically take an hour to a day. Also set the reason parameter to a justification to be considered by the reviewer.',
  'Contributing: You can help improve Kilotest by calling questionDiagnosis to question a diagnosis of a reported rule violation, and by calling requestFeature to request a new feature or a feature improvement.',
  'Parameters: Each tool provides the parameter(s) required by the next tool in the drill-down sequence. On any error in the parameters that you provide, the tool returns an explanatory error message.',
  'Response format: List responses are not paginated.',
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
    instructions: `${sharedContext} For guidance about using the Kilotest tools, call the getOverview tool.`
  });
  server.registerTool(
    'getOverview',
    {
      description: 'Gets an overview of Kilotest, explaining that it is a front-end quality testing service for the web and describing its tools and the structure of its test results. Call this before any other tool when the tools and workflow are unclear.',
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
      description: 'Lists all tested sites, alphabetically by name, each with its identifier and name and the count of its tested pages. Call this tool first to learn whether a site has been tested. If it has, call listPages to learn which of its pages have been tested. If the site has not been tested and you want it tested, call requestNewTest.',
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
      description: 'Lists the tested pages of one site, each with a page identifier, name, and URL, an array of the sites it belongs to (currently always 1), and the latest report identifier, sorted by page name. Call this after listSites to learn which pages of a site have been tested. Requires a siteID from listSites. After this tool, if you want to know which issues were reported, call listIssues. If you want a different page of the site tested, call requestNewTest.',
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
      description: 'Lists the issues reported in one report, each with an identifier, summary, and priority, sorted by summary. Also lists all the reports about the same page chronologically. Call this tool after listPages to begin getting test results about a page (optionally continuing to drill down with listViolators and listDiagnoses), or to switch to an earlier or later report. Also call this tool after requestNewTest or requestRetest to learn whether the requested test results are available. Requires a reportID from listPages, the list of reports, requestNewTest, or requestRetest. After this tool, if you want to know which elements violated rules belonging to one of the issues, call listViolators. If you want the entire JSON report for analysis outside Kilotest, call getReport instead of this tool, listViolators, or listDiagnoses.',
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
      description: 'Lists the elements of one page that were reported as violators of rules belonging to one issue in one report, each with its identifier (catalogIndex), tag name, inner text, and count of reporting rule engines, sorted by identifier. Call this tool after listIssues to continue drilling down. Requires an issueID and a reportID from listIssues. After this tool, if you want to know the diagnoses for a specific violator, call listDiagnoses. If you want the entire JSON report for analysis outside Kilotest, call getReport instead of listIssues, this tool, or listDiagnoses.',
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
      description: 'Lists the diagnoses by rule engines for one violator of rules belonging to one issue in one report, each with a description and severity. Call this after listViolators to continue drilling down. Requires a reportID, issueID, and catalogIndex (element identifier) from listViolators. After this tool, if you want to question a diagnosis, call questionDiagnosis. If you want the entire JSON report for analysis outside Kilotest, call getReport instead of listIssues, listViolators, or this tool.',
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
      description: 'Records and submits to management a disagreement with or doubts about one diagnosis reported by the listDiagnoses tool. Call this tool to question a diagnosis or its issue classification. Requires a reportID, issueID, catalogIndex (element identifier), engineID, and ruleID from listDiagnoses, and a reason explaining your concern. If your objection is more general than a single diagnosis, call requestFeature instead.',
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
      description: 'Gets an entire report as JSON. Call this tool if you want the full report for analysis outside of Kilotest. Requires a reportID from listPages or listIssues. The listIssues tool discloses the size of a report (typically 0.5 to 2 MB) before you decide whether to download it. If you want to interrogate Kilotest to get selected results, drill down with listIssues, listViolators, and/or listDiagnoses instead.',
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
      description: 'Requests that a not yet tested page be tested. Call this tool after listSites or listPages. Requires either a siteID from listSites if the site has been tested, or a siteName, namely the brand or organization name of the site, like the names shown by listSites, but distinct from the name of any tested site when lower-cased and stripped of punctuation and white space. Also requires a pageName describing the purpose of the page, such as home, about, contact, shop, blog, subscribe, sign up, or Benefactors Club; a URL, and a reason justifying the request. If the site has been tested, the pageName must be distinct from the names of all other tested pages of the site shown by listPages. Permits an optional boolean reviewImmediately parameter. If it is true, the response will notify you of approval (with a report identifier, and with an opportunity to call awaitTest and wait for, typically, 2 to 4 minutes), rejection, or queuing for management review. If reviewImmediately is false, the request will be queued for management review. If the page has already been tested, call requestRetest instead.',
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
      description: 'Requests that a page be tested again. Call this tool if you have reason to consider the latest report about the page outdated. Requires a reportID from listPages or listIssues. Permits an optional boolean reviewImmediately parameter. If it is true, the response will notify you of approval (with a report identifier, and with an opportunity to call awaitTest and wait for, typically, 2 to 4 minutes), rejection, or queuing for management review. If reviewImmediately is false, the request will be queued for management review. If the page has not yet been tested, call requestNewTest instead.',
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
      description: 'Requests a new feature or an improvement to an existing one. Requires a feature parameter describing the requested feature or improvement. If you want to question a diagnosis, call questionDiagnosis instead.',
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
      description: 'Blocks and waits for completion (or failure or 5-minute timeout) of a requested job. Call this tool if you requested a new test or retest with immediate review and you want to block the workflow until the test is complete. Requires a reportID from requestNewTest or requestRetest. If you choose not to wait or the wait times out, call listIssues with the reportID later to check whether the results are available.',
      inputSchema: awaitTestSchema,
      outputSchema: awaitTestResponseSchema,
      annotations: {
        title: 'Wait for a job requested with immediate review to finish',
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
// LEGACY-CONTRACT GUIDANCE

// The ChatGPT app directory can advertise an older Kilotest tool contract than this server implements, until OpenAI rechecks the server. Calls made under that older contract are answered here with an explanatory tool error (or, for getKilotestOverview, with the overview itself), so that the calling model can switch to the current tools instead of failing on an unknown tool or an opaque input-validation error. These tools are not registered and therefore not listed by tools/list. Each entry of legacyMCPCalls has a retireAfter date, after which a test fails until the entry is removed or its date extended; remove this whole section when the last entry is removed.

const newTestGuidance = 'To test a page that has no report yet, call the requestNewTest tool with reviewImmediately set to true. That tool now identifies the page’s site: first call the listSites tool, and then give the site identifier as siteID if the site has been tested, or otherwise the site name as siteName. Give the page’s name as pageName (formerly description), along with URL and reason.';

// Tool calls made under the older contract, keyed by tool name. Each entry gives the date of the change that made such calls obsolete, the date after which its handling is to be retired, whether the call is still served (rather than answered with a tool error), and a function returning the reply text for a call that matches the older contract, or null for a call that does not (and is therefore passed through to the current tool).
export const legacyMCPCalls: Record<string, {
  changeDate: string;
  retireAfter: string;
  served: boolean;
  reply: (args: Record<string, unknown>) => string | null;
}> = {
  getKilotestOverview: {
    changeDate: '2026-11-07',
    retireAfter: '2027-02-07',
    served: true,
    reply: () => kilotestOverview
  },
  orderNewTest: {
    changeDate: '2026-11-07',
    retireAfter: '2027-02-07',
    served: false,
    reply: () => `The orderNewTest tool no longer exists. ${newTestGuidance}`
  },
  orderRetest: {
    changeDate: '2026-11-07',
    retireAfter: '2027-02-07',
    served: false,
    reply: () => 'The orderRetest tool no longer exists. To retest a page, call the requestRetest tool with the same reportID and reason, and with reviewImmediately set to true.'
  },
  listPages: {
    changeDate: '2026-11-08',
    retireAfter: '2027-02-08',
    served: false,
    reply: args => args.siteID
      ? null
      : 'The listPages tool now lists the tested pages of one site and requires a siteID. First call the listSites tool to get the identifier of the site, and then call listPages with it as siteID.'
  },
  requestNewTest: {
    changeDate: '2026-11-08',
    retireAfter: '2027-02-08',
    served: false,
    reply: args => args.pageName || args.siteID || args.siteName
      ? null
      : `The parameters of the requestNewTest tool have changed. ${newTestGuidance}`
  }
};
// Returns a JSON-RPC response to an MCP message if it is a tool call made under the older contract, or otherwise null.
const getLegacyResponse = (message: any): object | null => {
  if (
    !message
    || typeof message !== 'object'
    || Array.isArray(message)
    || message.method !== 'tools/call'
    || typeof message.params?.name !== 'string'
  ) {
    return null;
  }
  const legacyCall = Object.hasOwn(legacyMCPCalls, message.params.name)
    ? legacyMCPCalls[message.params.name]!
    : null;
  if (!legacyCall) {
    return null;
  }
  const args = message.params.arguments && typeof message.params.arguments === 'object'
    ? message.params.arguments
    : {};
  const text = legacyCall.reply(args);
  if (text === null) {
    return null;
  }
  return {jsonrpc: '2.0', id: message.id ?? null, result: {content: [{type: 'text', text}], isError: !legacyCall.served}};
};
// Returns the body of a request, parsed as JSON, or undefined if it is not valid JSON.
const getParsedBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      return undefined;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  catch {
    return undefined;
  }
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
  const parsedBody = await getParsedBody(request);
  // If the body is not valid JSON or is too large: reject it as a parse error.
  if (parsedBody === undefined) {
    response.writeHead(400, {'content-type': 'application/json'});
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {code: -32700, message: 'Parse error: the request body is not valid JSON or is too large'},
      id: null
    }));
    return;
  }
  // If the request is a tool call made under the older contract: answer it with guidance.
  const legacyResponse = getLegacyResponse(parsedBody);
  if (legacyResponse) {
    await recordMetric('mcpToolCalls', `legacy:${(parsedBody as any).params.name}`);
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify(legacyResponse));
    return;
  }
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
  const server = createMCPServer();
  await server.connect(transport);
  await transport.handleRequest(request, response, parsedBody);
};
