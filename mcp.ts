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
  'Typical workflow: Suppose a user wants information about the quality of a website or a particular website page. Call the listSites tool to learn whether the site has been tested. If it has, call the listPages tool to learn which pages of the site have been tested. If any of them will suffice, drill down as far as needed to satisfy the user, calling the listIssues, listViolators, and/or listDiagnoses tools. If the full machine-oriented JSON report is wanted for analysis outside of Kilotest, call the getReport tool instead of drilling down beyond the listPages tool.',
  'Requesting more testing: If needed results have not been published, you can call the requestNewTest tool or, for a page with published but outdated results, the requestRetest tool. For both tools, if you set the optional reviewImmediately parameter to true, then your request is immediately reviewed, and, if approved, it typically takes 2 to 4 minutes to reach test completion, which you can optionally await by calling the awaitTest tool. If the parameter is not set to true or is absent, review and, on approval, testing typically take an hour to a day. Also set reason to a justification that will be considered by the reviewer.',
  'Parameters: Each tool provides the parameter(s) required by the next tool in the drill-down sequence. On any error in the paramaters that you provide, the tool returns an explanatory error message.',
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
      description: 'Explains what Kilotest (a front-end quality testing service for the web) is, what its tools do, and how its results are structured. Use this before any other tool when the available tools or workflow are unclear; it is unnecessary once you know which tool you need. Returns a prose overview of the Kilotest domain, the tool workflow, and links to further documentation.',
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
      description: 'Lists all sites of which Kilotest has tested any pages. Use this tool first to discover whether a site has been tested, and then listPages to discover which of its pages have been tested. Returns, for each tested site, its identifier, name, and count of tested pages. Entries are sorted by site name and are not paginated.',
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
      description: 'Lists the tested pages of one site. Use this after listSites to learn which pages of a site have been tested. The siteID comes from listSites. Returns, for each tested page of the site, its identifier, name, URL, and sites, and the identifier of its latest available report. Entries are sorted by page name and are not paginated.',
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
      description: 'Lists the history of reports about a page and the issues (each with an identifier) reported in one of the reports. Call this after listPages to begin getting test results about a page, or to switch to an earlier or later report. The reportID comes from listPages or the history. Returns facts about the reported issues, sorted by summary and not paginated. For more details, you can call listViolators with one of the issue identifiers. Call getReport instead when the entire JSON report is needed in one call and will be analyzed outside Kilotest.',
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
      description: 'Lists the elements of a tested page that were reported as violators of one issue in one report. Use this after listIssues to drill down from an issue to the elements violating rules belonging to that issue. The issueID comes from listIssues. Returns facts about each violator, sorted by their catalog indexes and not paginated.',
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
      description: 'Lists the diagnoses that rule engines gave for how one element exhibited one issue in one report. Use this after listViolators if the user wants to know what each rule engine said. The catalogIndex comes from listViolators. Returns, for each reported violation by the element of a rule belonging to the issue, the diagnosis given by the rule engine.',
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
      description: 'Accepts anonymous doubts aboout, or objections to, a diagnosis shown by the listDiagnoses tool; queued for review by management. Call this after listDiagnoses when you believe a rule violation was incorrectly diagnosed or was misclassified as to its issue. The parameters come from listDiagnoses. Returns a confirmation with disposition details.',
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
      description: 'Retrieves an entire report as JSON. Call this instead of drilling down through listIssues, listViolators, and listDiagnoses when the full report is needed in one call and will be analyzed outside of Kilotest. Otherwise, drill down with those tools instead. The reportID comes from listPages or from the report history that listIssues returns. Reports are typically 0.5 to 2 MB in size. The size is disclosed by the listIssues tool before you need to decide whether to download the report.',
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
      description: 'Receives a request to test a page that has not yet been tested. If the site has been tested, set siteID to the site identifier from listSites; otherwise set siteName to a brand or organization name like those shown by listSites, but distinct from the name of any tested site when lower-cased and stripped of punctuation and white space. Set pageName to a page description, such as home, about, contact, shop, blog, subscribe, sign up, or Benefactors Club, distinct from the name of any other tested page of the site shown by listPages.',
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
      description: 'Receives a request to retest a page whose latest report is considered outdated. Set reportID to the identifier of the latest report about the page from listPages or listIssues.',
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
      description: 'Receives a request to add a new feature or improve an existing one. Call questionDiagnosis instead to question a specific diagnosis shown by listDiagnoses. Describe the proposed feature or improvement. Returns a confirmation with disposition details.',
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
      description: 'Blocks and waits for completion (or failure or 5-minute timeout) of a requested job. Set reportID to the report identifier from requestNewTest or requestRetest. Use this instead of polling listIssues when the user expects test results as soon as they are available.',
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
