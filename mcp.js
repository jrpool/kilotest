/*
  mcp.js
  Handles MCP (Model Context Protocol) requests for Kilotest tools.
  Note: This file can be augmented with more comments:

[mcp.js](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:0:0-0:0) already has two of the description levels that [openapi.yaml](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/openapi.yaml:0:0-0:0) uses, and it can add two more. Here's the comparison:

## Already present in [mcp.js](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:0:0-0:0)

- **Tool-level `description`** (analogous to OpenAPI operation `description`): Each `registerTool` call includes a `description` string — e.g., `@/Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:32`.
- **Parameter-level `.describe()`** (analogous to OpenAPI parameter `description`): Each zod input field uses `.describe()` — e.g., `@/Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:34-35`.

## Missing — but supported by the MCP SDK

1. **Server-level `instructions`** (analogous to OpenAPI `info.description` at `@/Users/pool/Documents/Topics/repos/a11yTesting/kilotest/openapi.yaml:4`): The `McpServer` constructor accepts a second argument with an `instructions` property. Currently the constructor at `@/Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:28` only passes `{name, version}`. You could add:

```js
const server = new McpServer(
  {name: 'Kilotest', version: '1.0.0'},
  {
    instructions: 'Kilotest runs jobs that test web pages for front-end quality (i.e. accessibility, usability, and standards conformity). ...'
  }
);
```

This gives the LLM context about the entire tool collection, matching what `info.description` does in OpenAPI.

2. **`outputSchema` with descriptions** (analogous to OpenAPI response/schema `description` properties): The `registerTool` config supports an `outputSchema` field — a zod schema whose `.describe()` calls propagate to the JSON Schema advertised in `tools/list`. Currently [mcp.js](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:0:0-0:0) returns raw `JSON.stringify(result)` as text content with no output schema. You could add `outputSchema` and return `structuredContent`, e.g.:

```js
server.registerTool(
  'listAllAvailableReports',
  {
    description: '...',
    inputSchema: {},
    outputSchema: z.object({
      summary: z.string().describe('Natural-language facts about the request, the response, and Kilotest.'),
      // ... other fields with .describe()
    }),
    annotations: { ... }
  },
  async () => {
    const result = await reportListAPI.response();
    return {
      content: [{type: 'text', text: JSON.stringify(result)}],
      structuredContent: result
    };
  }
);
```

This would mirror the rich schema-level and property-level `description` properties throughout [openapi.yaml](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/openapi.yaml:0:0-0:0) (e.g., `@/Users/pool/Documents/Topics/repos/a11yTesting/kilotest/openapi.yaml:154`, `:179`, `:242`, `:269`).

## Summary

| OpenAPI `description` level | [mcp.js](cci:7://file:///Users/pool/Documents/Topics/repos/a11yTesting/kilotest/mcp.js:0:0-0:0) current | Can add? |
|---|---|---|
| `info.description` (API-level) | ❌ | ✅ via `instructions` in constructor |
| Operation `description` | ✅ | — |
| Parameter `description` | ✅ via `.describe()` | — |
| Response/schema `description` | ❌ | ✅ via `outputSchema` + `.describe()` |
| Schema property `description` | ❌ | ✅ via `outputSchema` property `.describe()` |
*/

// IMPORTS

const {McpServer} = require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport} = require(
  '@modelcontextprotocol/sdk/server/streamableHttp.js'
);
const {z} = require('zod');
const {isReportAvailable, isURL} = require('./util');
const targetAPI = require('./target/api');
const reportListAPI = require('./api/reportList');
const reportFactsAPI = require('./api/reportFacts');
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
      description: 'For each available report, summarize facts about it and provide URLs for next-level retrieval of detailed facts.',
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
        timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format, e.g. 260503T0432'),
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
      const result = await reportFactsAPI.response([timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'describeOneIssueFromOneReport',
    {
      description: 'Returns data from a specified Kilotest report about one of the issues for the front-end quality (i.e. accessibility, usability, and standards conformity) of a web page. The required issueID, timeStamp, and jobID parameters identify the issue and the report and are obtained from a summarizeOneReport response.',
      inputSchema: {
        issueID: z.string().describe('Issue identifier, e.g. contrastPoor'),
        timeStamp: z.string().describe('Report timestamp in YYMMDDTHHmm format, e.g. 260503T0432'),
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
        'description of the web page': z.string().describe('Short description of the page, following the naming conventions visible in the listAllAvailableReports response'),
        'URL of the web page': z.string().describe('Full HTTPS URL of the page to test'),
        'reason for testing the web page': z.string().describe('Reason for recommending this page for testing')
      },
      annotations: {
        title: 'Recommend quality testing of one web page',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({
      'description of the web page': what,
      'URL of the web page': url,
      'reason for testing the web page': why
    }) => {
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
