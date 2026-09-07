# Kilotest as connector to and collection of AI Tools

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application performing a service for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could operate as a set of tools for language models to allow them to improve their answers to questions about the front-end quality (accessibility, usability, and standards conformity) of specific web pages.

A decision was made to **make Kilotest discoverable, usable, and, where appropriate, used as a provider of tools for language models**.

## Terms

- **Language model**: A model (e.g., Claude Haiku 4.5, Kimi K2.7, GPT-5.4, Gemini 3.1 Pro) that can consume and generate text, images, or other content.
- **AI platform**: A platform (e.g., Claude Desktop, Perplexity, ChatGPT, Gemini 3.5 Flash) that gives human users access to the services of language models and connects language models to productivity resources.
- **tool**: A specialized productivity resource providing a capability that a language model needs but does not have. In the OpenAPI specification, the term _operation_ is used to mean tool.
- **connector**: A service that allows AI platforms to enable their language models to discover, evaluate, and use tools.

## Internal features

The internal features that make Kilotest a collection of tools for language models are:

- An API, with specific functional and utility modules in the `api` directory.
- Tests of the functionalities of the API.
- A [`JSON-LD`](https://json-ld.org/) script in the `index.html` file, providing structured data about the Kilotest API.
- Environment variables in the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- A generated `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- An `mcp.js` file, providing an MCP server for Kilotest.
- A `server.json` file, conforming to the [MCP server schema](https://modelcontextprotocol.io/), and a GitHub Actions workflow (`publish-mcp.yml`) that authenticates via GitHub OIDC and publishes that file to the official MCP Registry whenever `server.json` or `api/version.js` changes on the `main` branch.
- `mcp`, `mcp-server`, and `modelcontextprotocol` keywords in `package.json`, supporting discovery of the `@jrpool/kilotest` npm package by tools and humans searching the npm registry for MCP servers.
- A `sitemap.xml` file.
- Documentation in the `README.md` file.
- This `AI-TOOLS.md` file.
- A [tutorial on authorizing language models to use Kilotest](https://kilotest.com/qai/).

## External features

The external features that support the use of Kilotest as a collection of AI tools are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- Registration of Kilotest as an active server in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=kilotest) (`io.github.jrpool/kilotest`), maintained by the [Model Context Protocol](https://modelcontextprotocol.io/) project.
- Registration of Kilotest with the [Smithery](https://smithery.ai/servers/pool/kilotest) MCP server registry.
- Registration of Kilotest with the [Glama](https://glama.ai/mcp/connectors/com.kilotest/kilotest) MCP server registry.
- a [pull request](https://github.com/TensorBlock/awesome-mcp-servers/pull/2221) (on 2026-09-07) to add Kilotest to the [Awesome MCP Servers](https://github.com/TensorBlock/awesome-mcp-servers) list.
- Registration of Kilotest with the [RapidAPI](https://rapidapi.com/jrpool/api/kilotest/playground/apiendpoint_0f03577a-ff9a-472a-a0ed-533bd198981a) Hub.
- Deployment of an MCP server in HTTP mode on the Kilotest service host.
- Configuration of Claude Desktop on the local development host and the `claude.ai` web application to connect Claude Desktop models to the Kilotest MCP server. The configuration was performed in the UI of each platform with the addition of Kilotest as a _connector_. The user used the `Customize/Connectors/Add connector/Add custom connector` interface, providing these data before activating the `Add` button:

  - Name: Kilotest
  - Remote MCP server URL: `https://kilotest.com/mcp`

## Use cases

The rationale for Kilotest as a collection of tools for language models is set forth in the `llms-full.txt` file and is not repeated here.

Some common anticipated use cases for this role are:

1. A user of a web-builder platform with responsibility for a website asks an AI platform for help in creating or improving the website.
1. A prospective customer of a web development service asks an AI platform to evaluate the quality of websites in the portfolios of candidate vendors.
1. A professional web developer within an organization asks an AI platform for a code review.
1. A risk-management professional within an organization asks an AI platform to report on any web accessibility defects that could expose the organization to prosecution or civil litigation for disability discrimination.
1. A person who depends on web accessibility because of disabilities asks an AI platform to provide documentary support for a complaint to the owner of a website about accessibility defects.
1. A disability-rights advocate or attorney concerned with inaccessibility in a particular industry asks an AI platform to perform a front-end-quality comparison of some websites in that industry.

Among these use cases, case 3 would make it feasible for the user to tell an AI platform explicitly and formally that Kilotest is an available connector to tools that are relevant to the task. All 5 of the other use cases would not make that feasible. In those 5 use cases, the user has a question but relies on the AI platform to know or discover which relevant connectors exist, to select appropriate connectors, and to provide language models that can use those connectors and tools that they connect to.

Use cases 1, 2, 4, 5, and 6 exemplify a widespread expectation and demand for AI platform capability. The commonality is: “I have a question; answer it.” If Kilotest can be employed as an expert for AI platforms in relevant cases, platforms will be more successful in satisfying that demand. At present this is a difficult problem because of platform limitations and a lack of standardization.

## Future work

To-dos recommended by Claude Sonnet 5 Medium on Devin:

- **Other directories not yet targeted**, beyond Smithery/Glama/RapidAPI: mcp.so, PulseMCP, MCP Market/LobeHub marketplace, Docker MCP Catalog, Cursor's MCP directory, and the VS Code MCP gallery.

- **GitHub repo metadata is under-optimized for discovery**, independent of any MCP registry:

  - `homepage` field on the repo is empty (should be `https://kilotest.com`).
  - `topics` are only `mcp-server`, `model-context-protocol` — no `accessibility`, `a11y`, `wcag`, `llm-tools`, `ai-agent`, `openapi`, `playwright`, etc., which are what people actually browse/search by on GitHub.
  - `has_discussions: false` — enabling Discussions would support the "Contributing"/use-case-3 audience the doc describes.
  - No badges (npm version, MCP-registry-active, license) in `README.md`, which affects how scrapers/humans triage the repo when they land on it from a directory link.

- **No content/backlink outreach.** Registrations are passive listings; there's no blog post, Show HN, or subreddit post (r/modelcontextprotocol, r/accessibility, r/webdev) building external backlinks and social-discovery signal, which the doc's own "difficult problem…lack of standardization" framing suggests is exactly the gap left for the **human**-driven parts of discoverability.

- **No cross-linking from the Testaro repo**, which Kilotest depends on and which has its own audience; a mention there is essentially a free, topically-relevant backlink.

- **Client-onboarding friction isn't documented.** Some MCP clients need the `mcp-remote` npx bridge to use a remote streamable-HTTP server like Kilotest's. Ready-made Claude Desktop/Cursor/Windsurf config snippets in `AI-TOOLS.md`/`README.md` would convert "discovered" into "used" faster, since case 3 of your use cases assumes a technically savvy discoverer but not all users are.

- **No verified search-engine indexing step** (Google Search Console / Bing IndexNow submission of `sitemap.xml`) to accelerate crawling of `llms.txt`/`openapi.yaml`, separate from just having the files exist.
