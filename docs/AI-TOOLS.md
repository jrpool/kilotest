# Kilotest as connector to and collection of AI Tools

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application performing a service for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could operate as a set of tools for language models to allow them to improve their answers to questions about the front-end quality (accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG) of specific web pages.

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
- A [`JSON-LD`](https://json-ld.org/) script in the `web/home/index.html` file, providing structured data about the Kilotest API.
- Environment variables in the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- A generated `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- An `mcp.js` file, providing an MCP server for Kilotest.
- A `server.json` file, conforming to the [MCP server schema](https://modelcontextprotocol.io/), and a GitHub Actions workflow (`publish-mcp.yml`) that authenticates via GitHub OIDC and publishes that file to the official MCP Registry whenever `server.json` or `api/version.ts` changes on the `main` branch.
- A `capability.md` file with a URL, summarizing what Kilotest tools can do.
- `mcp`, `mcp-server`, and `modelcontextprotocol` keywords in `package.json`, supporting discovery of the `@jrpool/kilotest` npm package by tools and humans searching the npm registry for MCP servers.
- An `lhm.plugin.json` file, conforming to the [LobeHub plugin manifest format](https://market.lobehub.com/s/publish-mcp/references/manifest), declaring Kilotest as a plugin in the [LobeHub MCP Market](https://lobehub.com/mcp). Publishing and updating are non-automated (`lhm plugin publish` for the initial listing; thereafter `npm run publish:lhm`, which wraps `lhm plugin update` and also runs from the `postpublish` hook), because LobeHub requires browser-based OAuth and does not support machine-to-machine publishing.
- A `sitemap.xml` file.
- Documentation in the `README.md` file.
- This `AI-TOOLS.md` file.
- A [tutorial on authorizing language models to use Kilotest](https://kilotest.com/tutorialAI.html).

## External features

The external features that support the use of Kilotest as a collection of AI tools are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- Registration of Kilotest as an active server in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.jrpool/kilotest), maintained by the [Model Context Protocol](https://modelcontextprotocol.io/) project. The [PulseMCP](https://www.pulsemcp.com/servers) directory and the VS Code MCP gallery both crawl this registry, so Kilotest is discoverable through them with no separate submission.
- Registration of Kilotest with the [Smithery](https://smithery.ai/servers/pool/kilotest) MCP server registry.
- Registration of Kilotest with the [Glama](https://glama.ai/mcp/connectors/com.kilotest/kilotest) MCP server registry, including a claim of ownership of the MCP connector by the maintainer via a `TXT` DNS record for `_glama-claim.kilotest.com`, with the value `glama_claim_gVV4HrPdcXr9TEfj1p3icEUBJ3_OVJGX`.
- Registration of Kilotest with [Awesome MCP Servers](https://www.tensorblock.co/mcp/servers/github-jrpool-kilotest-f518ba36).
- Registration of Kilotest with the [RapidAPI](https://rapidapi.com/jrpool/api/kilotest/playground/apiendpoint_0f03577a-ff9a-472a-a0ed-533bd198981a) Hub.
- Registration of Kilotest with the [LobeHub MCP Market](https://lobehub.com/mcp) (identifier: `jrpool-kilotest`), enabled with an `lhm.plugin.json` file.
- Deployment of an MCP server in HTTP mode on the Kilotest service host.
- Submission of the MCP server to the [Claude directory of plugins and connectors](https://claude.ai/directory/manage).
- Configuration of Claude Desktop on the local development host and the `claude.ai` web application to connect Claude Desktop models to the Kilotest MCP server. The configuration was performed in the UI of each platform with the addition of Kilotest as a _connector_. The user used the `Customize/Connectors/Add connector/Add custom connector` interface, providing these data before activating the `Add` button:

  - Name: Kilotest
  - Remote MCP server URL: `https://kilotest.com/mcp`

- MCP-related topics added to the [repository details](https://github.com/jrpool/kilotest).
- An [MCP Registry badge](https://registry.modelcontextprotocol.io/v0/servers?search=kilotest) added to the `README.md` file.
- A link to the MCP server on the `README.md` page of the [`testaro-issues`](https://github.com/jrpool/testaro-issues) repository.
- Registration of Kilotest and its sitemap at [Google Search Console](https://search.google.com/search-console?resource_id=sc-domain:kilotest.com) and [Bing Webmaster Tools](https://www.bing.com/webmasters/home?siteUrl=https://kilotest.com/).

## Required maintenance

Releasing a new version is a two-script procedure:

- On a feature branch, commit all substantive changes, then execute `npm run prePR -- <level>` (`major`, `minor`, or `patch`). The script bumps `package.json` and `package-lock.json`, regenerates `openapi.yaml` and the versions of `server.json` and `lhm.plugin.json` via the `version` hook, commits and pushes the result, and records the branch name for the next step.
- Submit a pull request and merge it to `main` (triggers `publish-mcp.yml` automatically for the MCP Registry).
- Execute `npm run postPR`. The script checks out and pulls `main`, verifies that the merge landed, publishes to npm (whose `postpublish` hook updates the LobeHub listing), deletes the feature branch, and prunes remote-tracking branches. If the LobeHub update fails, retry it alone with `npm run publish:lhm`.

### Contract changes and external registries

A change to the tool or API contract (tool names, parameter names, schemas, response shapes, or paths) makes every stored copy of the contract stale. Which copies exist and what to do about each:

**In-repository contract copies:**

- `openapi.yaml`: regenerated automatically by the `version` hook during `npm run prePR`; never edit it by hand.
- `server.json`: contains only the server descriptor (name, description, repository, remotes, version), no tool schemas. Its version is synced by `update-versions.ts`; edit it manually only if the server description or remote URL changes.
- `lhm.plugin.json`: embeds every tool’s input and output schema and its descriptions, in the LobeHub manifest format. It is hand-maintained, not generated, so transform it to match `api/schemas.ts` and `mcp.ts` whenever the contract changes.
- `llms.txt`, `llms-full.txt`, `capability.md`, `README.md`: hand-maintained; search them for stale parameter and path names after a contract change.

**External registries that update themselves, needing no maintainer action:**

- The official MCP Registry: `publish-mcp.yml` republishes `server.json` whenever `server.json` or `api/version.ts` changes on `main`, i.e. on every release. The listing contains no tool schemas, so a contract change alone needs nothing extra.
- PulseMCP and the VS Code MCP gallery: crawl the MCP Registry.
- Smithery and Glama: derive their tool listings from the deployed server’s own `tools/list` response (and repository scans) on their own crawl schedules. Their listings can lag temporarily behind a contract change, but they correct themselves.
- `openapi-directory` (APIs.guru): maintains its own copy of `openapi.yaml`, refreshed from the registered source URL on its own schedule.
- `public-apis`, the WAI evaluation tools list, Awesome MCP Servers, and the Claude connector directory: store only a link or a connector name and remote URL; contract changes do not affect them.

**External registries requiring maintainer action:**

- The LobeHub MCP Market listing is published from `lhm.plugin.json` and is non-automated, because LobeHub requires browser-based OAuth. A normal release pushes the updated file via the `postpublish` hook; to push a contract update without a release, run `npm run publish:lhm`.
- The RapidAPI Hub listing stores a copy of the API endpoints. After releasing a contract change, open the Kilotest API dashboard on RapidAPI and update the API definition, either by importing the regenerated `openapi.yaml` or by editing the endpoints to match, so the playground reflects the new contract.

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

- **No content/backlink outreach.** Registrations are passive listings; there's no blog post, Show HN, or subreddit post (r/modelcontextprotocol, r/accessibility, r/webdev) building external backlinks and social-discovery signal, which the doc's own "difficult problem…lack of standardization" framing suggests is exactly the gap left for the **human**-driven parts of discoverability.

- **Other directories not yet targeted.** The [mcp.so](https://mcp.so/submit) directory offers a free tier but steers submitters toward a $39 paid listing; deferred as a commercial decision. The Docker MCP Catalog is not a fit because it requires stdio transport and a Dockerfile, and Kilotest is streamable-http.

- **Client-onboarding friction isn't documented.** Some MCP clients need the `mcp-remote` npx bridge to use a remote streamable-HTTP server like Kilotest's. Ready-made Claude Desktop/Cursor/Windsurf config instructions added to the AI tutorial would convert "discovered" into "used" faster, since case 3 of your use cases assumes a technically savvy discoverer but not all users are.

Other future work:

- Add to the AI tutorial, or replace much of the current AI tutorial content with, an [Add Custom Connector link](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Kilotest&connectorUrl=https%3A%2F%2Fkilotest.com%2Fmcp).
- Recommended by GLM-5.2 High: Submit a Kilotest-appropriate request to one or more AI platforms and discover whether the model discovers Kilotest and, if so, either uses it or offers to use it in the creation of a response.
- Recommended by ChatGPT: A general capability manifest that says, in one machine-readable place: Here are the capabilities Kilotest provides; here are all the interfaces through which you can invoke them; here are their requirements and effects. For example:

    ```markdown
    Capability: web-page-quality-audit

    Purpose:
      Test a web page for accessibility,
      usability, HTML and web-standards problems.

    Interfaces:
      MCP: https://kilotest.com/mcp
      OpenAPI: https://kilotest.com/openapi.yaml
      Web UI: https://kilotest.com/

    Input:
      Public URL

    Output:
      Structured findings, affected elements,
      rule-engine diagnoses, WCAG mappings

    Side effects:
      Reads the specified web page.
      Does not modify the target site.

    Cost:
      ...
    ```
