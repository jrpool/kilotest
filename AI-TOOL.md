# Kilotest as an AI Tool

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could also act as a tool for use by language models. Language models are asked for help in all domains, including the domain of software quality. When asked about the front-end quality (accessibility, usability, and standard conformity) of specific web pages, models gave answers without the use of tools, and the answers were inferior: simplistic, speculative, and fabricated. If a model were to use Kilotest as a tool, the model could give comprehensive, authoritative, grounded, and factual answers. Every reported defect could be documented and ascribed to one or more specific tools in the Kilotest ensemble.

Given the potential of Kilotest as an AI tool and the expected continued growth in the share of questions that are directed to language models, a decision was made to **make Kilotest discoverable, usable, and, where appropriate, used as a tool for language models**.

## Internal additions

The internal changes that have been made in the Kilotest codebase to support the use of Kilotest as an AI tool are:

- An API, consisting of:
  - Additions to `index.js`.
  - Addition to `util.js`.
  - Within directories providing API functionality:
    - `api.js` modules.
    - `util.js` modules, if needed, containing resources shared by the `index.js` and `api.js` modules in those directories.
- Additions to the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- An `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- A `sitemap.xml` file.
- A `researchAgent.js` file, testing the API.

## External actions

The external actions that have been taken to support the use of Kilotest as an AI tool are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- A [request](https://rapidapi.com/studio/api_91f2ce07-2572-48bd-a34d-ff01ed6cd039/publish/general) to add Kilotest to the Rapid API Hub.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- [Configuration of Claude Desktop](https://github.com/ivo-toby/mcp-openapi-server#option-1-using-with-claude-desktop-stdio-transport) on the local development host to let Claude models find Kilotest.
- [Deployment of an MCP server in HTTP mode](https://github.com/ivo-toby/mcp-openapi-server#option-2-using-with-http-clients-http-transport) on port 3001 of the Kilotest service host.

## Use cases

The rationale for Kilotest as a tool for language models is set forth in the `llms-full.txt` file and is not repeated here.

Some common anticipated use cases for this role are:

1. A user of a web-builder platform with responsibility for a website asks an AI platform for help in creating or improving the website.
1. A prospective customer of a web development service asks an AI platform to evaluate the quality of websites in the portfolios of candidate vendors.
1. A professional web developer within an organization asks an AI platform for a code review.
1. A risk-management professional within an organization asks an AI platform to report on any web accessibility defects that could expose the organization to prosecution or civil litigation for disability discrimination.
1. A person who depends on web accessibility because of disabilities asks an AI platform to provide documentary support for a complaint to the owner of a website about accessibility defects.
1. A disability-rights advocate or attorney concerned with inaccessibility in a particular industry asks an AI platform to perform a front-end-quality comparison of some websites in that industry.

Among these use cases, case 3 would make it feasible for the user to tell an AI platform explicitly and formally that Kilotest is an available tool relevant to the task and where to find Kilotest. All 5 of the other use cases would not make that feasible. In those 5 use cases, the user has a question but relies on the AI platform to know or discover which relevant tools exist, to select appropriate tools, to know or learn how to use those tools, and to use them.

Use cases 1, 2, 4, 5, and 6 exemplify a widespread expectation and demand for AI platform capability. The commonality is: “I have a question; answer it.” If Kilotest can be employed as an expert for AI platforms in relevant cases, platforms will be more successful in satisfying that demand. At present this is a difficult problem because of platform limitations and a lack of standardization.

## Strategy

The Kilotest project is attempting to solve the just-described problem. That attempt follows the following strategy.

### Increments

The standardization of tool discovery and utilization by and for language models and AI platforms is partial. Major differences in protocols exist among model and platform families. Therefore, small testable increments of improvement in the tool functionality of Kilotest can best be defined by model and platform family and by use-case characteristics.

One benefit of this type of incrementalism is that, after the first increment succeeds, it becomes possible to make and test external changes publicizing the fact that a particular platform-model combination delivers unprecedentedly comprehensive, truthful, and low-cost answers in a particular class of use cases to questions about front-end web quality.

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

That configuration notifies models that Kilotest is available as a tool, but does not explain what it is useful for and does not require them to use it.

Experimentation revealed that Claude Sonnet 4.6 with Medium effort chose to use Kilotest when answering questions about the accessibility and usability of particular public web pages. Low effort did not result in the use of Kilotest. The less capable Claude Haiku model did not use Kilotest.

### Increment 2

Increment 2 somewhat lightens the burden on the user by shifting the user environment from an installed application to a web browser. The platform is the `claude.ai` web application instead of Claude Desktop. Instead of editing a JSON file, the user tells the platform about Kilotest with a setting.

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
  script: 'mcp-openapi-server',
  interpreter: 'none',
  args: '--transport http --port 3001 --api-base-url https://kilotest.com --openapi-spec https://kilotest.com/openapi.yaml',
  instances: 1,
  autorestart: true,
  watch: false
}
```

#### Investigation
