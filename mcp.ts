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
  'Typical workflow: Suppose a user wants information about the quality of a website or a particular website page. Call the listSites tool to learn whether the site has been tested. If it has, call the listPages tool to learn which pages of the site have been tested. If any of them will suffice, drill down as far as needed to satisfy the user, calling the listIssues, listViolators, and/or listDiagnoses tools. If the full machine-oriented JSON report is wanted, call the getReport tool. If no satisfactory results have been published, you can call the requestNewTest tool or, for a page with published results that are outdated, the requestRetest tool. Both of those tools permit a reviewImmediately parameter. If it is set to true, then the request is immediately reviewed, and, if approved, test completion typically takes 2 to 4 minutes, which you can optionally await notification of by calling the awaitTest tool. To check later instead, call the listIssues tool.',
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
      description: 'Lists the tested pages of one site. Use this after listSites to learn which pages of a site have been tested. The siteID comes from listSites. Returns, for each tested page of the site, its identifier, name, URL, sites, and the identifier of its latest available report. Entries are sorted by page name and are not paginated.',
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
      description: 'Lists the issues reported in one report, along with the history of all reports about the same page. Use this after listPages to begin examining a report about a page, or to switch to an earlier or later report. The reportID comes from listPages or the history. Returns facts about the reported issues, sorted by summary and not paginated. The returned issue identifiers are inputs to the listViolators tool. Use getReport instead when the entire report is needed in one call.',
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
// LEGACY-CONTRACT GUIDANCE

// The ChatGPT app directory can advertise an older Kilotest tool contract than this server
// implements, until OpenAI rechecks the server. Calls made under that older contract are
// answered here with an explanatory tool error (or, for getKilotestOverview, with the
// overview itself), so that the calling model can switch to the current tools instead of
// failing on an unknown tool or an opaque input-validation error. These tools are not
// registered and therefore not listed by tools/list. Each entry of legacyMCPCalls has a
// retireAfter date, after which a test fails until the entry is removed or its date extended;
// remove this whole section when the last entry is removed.

const newTestGuidance = 'To test a page that has no report yet, call the requestNewTest tool with reviewImmediately set to true. That tool now identifies the page’s site: first call the listSites tool, and then give the site identifier as siteID if the site has been tested, or otherwise the site name as siteName. Give the page’s name as pageName (formerly description), along with URL and reason.';

// Tool calls made under the older contract, keyed by tool name. Each entry gives the date
// of the change that made such calls obsolete, the date after which its handling is to be
// retired, whether the call is still served (rather than answered with a tool error), and a
// function returning the reply text for a call that matches the older contract, or null
// for a call that does not (and is therefore passed through to the current tool).
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
// Returns a JSON-RPC response to an MCP message if it is a tool call made under the older
// contract, or otherwise null.
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
