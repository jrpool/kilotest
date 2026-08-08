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
    annotations: {...}
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
const listReportsAPI = require('./api/listReports');
const listIssuesAPI = require('./api/listIssues');
const listViolatorsAPI = require('./api/listViolators');
const requestTestAPI = require('./api/requestTest');
const requestRetestAPI = require('./api/requestRetest');

// CONSTANTS

exports.mcpPath = '/mcp';

// FUNCTIONS

// Creates and returns an McpServer with Kilotest tools registered.
const createMCPServer = () => {
  const server = new McpServer({
    name: 'Kilotest',
    version: '2.0.0',
    description: 'Tools that test web pages for front-end quality (accessibility, usability, and standards conformity) and make test results available',
    instructions: 'Use the listReports tool to start. If it shows that there is a report available about the page you want facts about, drill down with the listIssues, listViolators, and listDiagnoses tools. If not, use the requestTest tool to request that the page be tested. If the latest report about the page is obsolete, use the requestRetest tool to request that the page be retested.'
  });
  server.registerTool(
    'listReports',
    {
      description: 'Provide basics about all available reports.',
      inputSchema: {},
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
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'listIssues',
    {
      description: 'Provide details about one report, including basics about the issues reported in it.',
      inputSchema: {
        timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
        jobID: z.string().describe('Job identifier of the report (example: x9z)')
      },
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
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'listViolators',
    {
      description: 'Provide details about one issue in one report, including basics about the elements of the tested page that were reported as exhibiting the issue.',
      inputSchema: {
        issueID: z.string().describe('Issue identifier (example: contrastPoor)'),
        timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
        jobID: z.string().describe('Job identifier of the report (example: x9z)')
      },
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
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'listDiagnoses',
    {
      description: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.',
      inputSchema: {
        catalogIndex: z.string().describe('Identifier of the issue-exhibiting element in the catalog of elements on the page (example: 372)'),
        issueID: z.string().describe('Issue identifier (example: contrastPoor)'),
        timeStamp: z.string().describe('Timestamp of the report in YYMMDDTHHmm format (example: 260503T0432)'),
        jobID: z.string().describe('Job identifier of the report (example: x9z)')
      },
      annotations: {
        title: 'Provide details about one element reported as exhibiting one issue in one report, including the diagnoses provided by rule engines about how the element exhibited the issue.',
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async ({catalogIndex, issueID, timeStamp, jobID}) => {
      const result = await listViolatorsAPI.response([catalogIndex, issueID, timeStamp, jobID]);
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'requestTest',
    {
      description: 'Process my request to test a page about which no report is available yet.',
      inputSchema: {
        description: z.string().describe('10- to 100-character description of the page conforming to the naming convention used in the listReports output'),
        URL: z.string().describe('12- to 300-character URL of the page, including the https:// scheme and any query'),
        reason: z.string().describe('20- to 100-character reason why the page should be tested')
      },
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
      return {content: [{type: 'text', text: JSON.stringify(result)}]};
    }
  );
  server.registerTool(
    'requestRetest',
    {
      description: 'Process my request to retest a page about which a report is available.',
      inputSchema: {
        timeStamp: z.string().describe('Timestamp of the latest report about the page in YYMMDDTHHmm format (example: 260503T0432)'),
        jobID: z.string().describe('Job identifier of the latest report about the page (example: x9z)'),
        reason: z.string().describe('20- to 100-character reason why the page should be retested')
      },
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
