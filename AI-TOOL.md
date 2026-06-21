# Kilotest as connector to and creator of AI Tools

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application performing a service for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could also act as a connector to tools for use by language models. Language models are asked for help in all domains, including the domain of software quality. When asked about the front-end quality (accessibility, usability, and standard conformity) of specific web pages, models gave answers without the use of tools. The answers were at best fragmentary but often speculative and fabricated. If Kilotest offered to connect language models to its functionalities as tools, models could give more inexpensive, comprehensive, factual, authoritative, and grounded answers. Every reported defect could be documented and ascribed to one or more specific rule engines in the Kilotest ensemble.

Given the potential of Kilotest to serve language models and the expected continued growth in the share of questions that are directed to AI platforms that use language models, a decision was made to **make Kilotest discoverable, usable, and, where appropriate, used as a connector to, and creator of, tools for language models**.

## Terms

- **Language model**: A model (e.g., Claude Haiku 4.5, Kimi K2.6, GPT-5.4, Gemini 3.1 Pro) that can consume and generate text, images, or other content.
- **AI platform**: A platform (e.g., Claude Desktop, Perplexity, ChatGPT, Gemini 3.5 Flash) that gives human users access to the services of language models and connects language models to productivity resources.
- **tool**: A specialized productivity resource providing a capability that the language model itself needs but does not have. In the OpenAPI specification, the term _operation_ is used to mean tool.
- **connector**: A service that allows AI platforms to enable their language models to discover, evaluate, and use tools.

Tools can be independent of connectors that connect them to language models, but Kilotest can be both. It already provides capabilities to human users; it can re-use the same functions that underlie those capabilities and reconfigure those functions as tools for language models. Kilotest can also provide connectors to those tools for language models and make those connectors compatible with AI platforms.

## Internal additions

The internal changes that have been made in the Kilotest codebase to support the use of Kilotest as a set of tools and connectors to them are:

- An API, consisting of:
  - Additions to `index.js`.
  - Additions to `util.js`.
  - Within directories providing API functionality:
    - `api.js` modules.
    - `util.js` modules, if needed, containing resources shared by the `index.js` and `api.js` modules in those directories.
- Additions to the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- An `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- An `mcp.js` file, providing an MCP server for Kilotest.
- A `sitemap.xml` file.
- Additions to the `README.md` file.
- This `AI-TOOL.md` file.
- A `researchAgent.js` file, testing the API.

## External actions

The external actions that have been taken to support the use of Kilotest as an AI tool are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- A [request](https://rapidapi.com/studio/api_91f2ce07-2572-48bd-a34d-ff01ed6cd039/publish/general) to add Kilotest to the Rapid API Hub.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- [Configuration of Claude Desktop](https://github.com/ivo-toby/mcp-openapi-server#option-1-using-with-claude-desktop-stdio-transport) on the local development host to connect Claude Desktop models to Kilotest tools.
- Deployment of an MCP server in HTTP mode on the Kilotest service host.

## Use cases

The rationale for Kilotest as a connector to tools for language models is set forth in the `llms-full.txt` file and is not repeated here.

Some common anticipated use cases for this role are:

1. A user of a web-builder platform with responsibility for a website asks an AI platform for help in creating or improving the website.
1. A prospective customer of a web development service asks an AI platform to evaluate the quality of websites in the portfolios of candidate vendors.
1. A professional web developer within an organization asks an AI platform for a code review.
1. A risk-management professional within an organization asks an AI platform to report on any web accessibility defects that could expose the organization to prosecution or civil litigation for disability discrimination.
1. A person who depends on web accessibility because of disabilities asks an AI platform to provide documentary support for a complaint to the owner of a website about accessibility defects.
1. A disability-rights advocate or attorney concerned with inaccessibility in a particular industry asks an AI platform to perform a front-end-quality comparison of some websites in that industry.

Among these use cases, case 3 would make it feasible for the user to tell an AI platform explicitly and formally that Kilotest is an available connector to tools that are relevant to the task. All 5 of the other use cases would not make that feasible. In those 5 use cases, the user has a question but relies on the AI platform to know or discover which relevant connectors exist, to select appropriate connectors, and to provide language models that can use those connectors and tools that they connect to.

Use cases 1, 2, 4, 5, and 6 exemplify a widespread expectation and demand for AI platform capability. The commonality is: “I have a question; answer it.” If Kilotest can be employed as an expert for AI platforms in relevant cases, platforms will be more successful in satisfying that demand. At present this is a difficult problem because of platform limitations and a lack of standardization.

## Strategy

The Kilotest project is attempting to solve the just-described problem. That attempt follows the following strategy.

### Increments

Connector and tool discovery and utilization have been only partly standardized. Major differences in protocols exist among model and platform families. Therefore, small testable increments of improvement in the connector and tool functionality of Kilotest can best be defined by model and platform family and by use-case characteristics.

One benefit of such incrementalism is that, after the first increment succeeds, it becomes possible to make and test external changes publicizing the fact that a particular platform-model combination delivers unprecedentedly inexpensive, comprehensive, and truthful answers in a particular class of use cases to questions about front-end web quality.

Another benefit is that subsequent increments can be defined incrementally rather than in advance. Lessons learned from the work on each increment can inform the choice of what to work on next.

#### Increment 1

In the first increment, the objective was to make Anthropic Claude models use Kilotest to help them answer questions from developers using the Claude Desktop application for use case 3, where the code in question is already deployed as a public web page.

As mentioned above, Claude Desktop was installed on the local development host and then configured for Kilotest. That configuration consisted of the addition of a property to the Claude Desktop configuration file, located at `~/Library/Application Support/Claude/claude_desktop_config.json`. The added property is:

```json
"mcpServers": {
  "kilotest": {
    "command": "npx",
    "args": [
      "-y",
      "@ivotoby/openapi-mcp-server"
    ],
    "env": {
      "API_BASE_URL": "https://kilotest.com",
      "OPENAPI_SPEC_PATH": "https://kilotest.com/openapi.yaml"
    }
  }
},
```

That configuration notifies models that Kilotest is available as an MCP server, but does not explain what tools it provides, what they are useful for, or how to use them.

Experimentation revealed that Claude Sonnet 4.6 with Medium effort chose to use Kilotest when answering questions about the accessibility and usability of particular public web pages. Low effort did not result in the use of Kilotest. The less capable Claude Haiku model did not use Kilotest.

### Increment 2

Increment 2 somewhat lightens the burden on the user by shifting the user environment from an installed application to a web browser, and by providing an easier interface for users to tell the platform about Kilotest. The platform is the `claude.ai` web application instead of Claude Desktop. Instead of editing a JSON file, the user tells the platform about Kilotest with a setting.

#### Setup

As mentioned in the list of external actions, an MCP server was deployed on port 3001 of the Kilotest service host(described in the `SERVICE.md` file).

First, the `openapi-mcp-server` package was installed globally with `sudo npm install -g @ivotoby/openapi-mcp-server`.

Next, the Caddy reverse proxy on the server was configured to forward requests to the MCP server on port 3001. The `/etc/caddy/Caddyfile` file had this content after that:

```text
# Configuration of the Caddy web server.
# Docs: https://caddyserver.com/docs/caddyfile.

kilotest.com {
  # Enable Zstandard and Gzip compression of responses.
  encode zstd gzip
  # Reverse proxy all MCP server requests to port 3001.
  handle /mcp* {
    reverse_proxy localhost:3001 {
      flush_interval -1
    }
  }
  # Reverse proxy all other requests to localhost:3000.
  reverse_proxy localhost:3000 {
    # Improve SSE latency.
    flush_interval -1
  }
}
```

Finally, the `pm2` process manager was reconfigured to manage the MCP server process, with this additional item added to the `apps` array in the `pm2.config.js` file in this application:

```javascript
{
  name: 'kilotest-mcp',
  script: 'openapi-mcp-server',
  interpreter: 'none',
  args: '--transport http --port 3001 --api-base-url https://kilotest.com --openapi-spec https://kilotest.com/openapi.yaml',
  instances: 1,
  autorestart: true,
  watch: false
}
```

Then the `pm2 start pm2.config.js` command was entered on the server in the Kilotest directory to restart Kilotest and start the `kilotest-mcp` process.

#### Investigation

The investigation began with the addition of Kilotest as a _connector_ to the `claude.ai` web application. The user used the `Customize/Connectors/Add connector/Add custom connector` interface, providing these data before activating the `Add` button:

- Name: Kilotest
- Remote MCP server URL: `https://kilotest.com/mcp`

When the connector configuration with 4 endpoints appeared, the user changed the tool permissions for all 4 endpoints from `Needs approval` to `Always allow`.

Then the user asked the platform, “Summarize the accessibility and usability of the home page of the website of Salesforce.”

The results with various models were:

- Claude Haiku 4.5 not extended: Summarized accessibility programs of Salesforce, instead of saying anything about its home page.
- Claude Haiku 4.5 extended: Announced this thought process: “Deliberated between direct inspection and specialized accessibility testing tools”; then announced that it was using Kilotest, specifically the `summarize-accessibility-of-all-tested-web-pages` path; then stated: “Great! I've loaded the Kilotest tools. Now let me first check if Salesforce has already been tested by calling the summarize function. If not, I'll submit it for testing.”

These results show that on the `claude.ai` platform, when configured with Kilotest as a connector, even Claude Haiku, in its Extended mode, can decide to use Kilotest when appropriate and can check for existing data before deciding to recommend that Kilotest test a page. This correct sequencing may be a result of the revised path descriptions in the `openapi.yaml` file recommending that sequencing.

In the first run, Claude Haiku paused for about 5 minutes and then reported: “The Kilotest service seems to have timed out. Let me try a different approach - I'll fetch the Salesforce home page directly and evaluate it myself for accessibility and usability issues.”
