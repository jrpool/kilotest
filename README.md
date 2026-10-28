# Kilotest

[![npm version](https://img.shields.io/npm/v/@jrpool/kilotest?label=npm)](https://www.npmjs.com/package/@jrpool/kilotest)
[![license](https://img.shields.io/github/license/jrpool/kilotest?label=license)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-active-success)](https://registry.modelcontextprotocol.io/v0/servers?search=kilotest)
[![GitHub stars](https://img.shields.io/github/stars/jrpool/kilotest?label=stars)](https://github.com/jrpool/kilotest/stargazers)
[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/github-jrpool-kilotest-f518ba36/badge.svg)](https://tensorblock.co/mcp/servers/github-jrpool-kilotest-f518ba36)
[![mcptry](https://mcptry.com/badge/io.github.jrpool/kilotest)](https://mcptry.com/servers/io.github.jrpool/kilotest)

An ensemble testing and reporting service for front-end web quality

## Features

This application uses an ensemble of 12 rule engines to test web pages for front-end quality (i.e. accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG).

The testing paradigm employed by Kilotest is discussed in these papers:

- [How to run a thousand accessibility tests](https://medium.com/cvs-health-tech-blog/how-to-run-a-thousand-accessibility-tests-63692ad120c3)
- [Testaro: Efficient Ensemble Testing for Web Accessibility](https://arxiv.org/abs/2309.10167)
- [Accessibility Metatesting: Comparing Nine Testing Tools](https://arxiv.org/abs/2304.07591)

Kilotest acts as a web server for human users, an MCP server (streamable HTTP, no authentication) for AI platforms, and an API for programmatic access.

Testing for Kilotest is performed by one or more workers (testing agents) that obtain jobs from Kilotest, perform them, and send reports of the results back to Kilotest. Those agents are instances of the [Testaro](https://www.npmjs.com/package/testaro) package. Thus, the pages that Kilotest tests need not be on the public Internet. They need only be reachable by the Testaro workers that do the testing for Kilotest. So, one or more Testaro workers running inside a private intranet can test internal pages, as well as any external ones reachable from inside the intranet.

An active production instance of Kilotest may require multiple Testaro workers to handle the load, because testing one web page typically takes 2 to 4 minutes and workers test only one page at a time.

## Getting started locally with 1 worker

### Installation

In the steps below, hosts `T` and `K` may be the same host or two different hosts. Host `T` can be a Debian stable, Ubuntu LTS, Windows, or macOS host. Host `K` can be any server host that can run the latest LTS version of Node.js. If hosts `T` and `K` differ, then they must be open to `https` traffic and host `K` must permit `https` requests from host `T`.

1. Clone the [Testaro project](https://github.com/YRA-Tech/testaro) into a new directory on host `T`.
1. In that directory, install the Testaro dependencies: `npm install`.
1. Update the Testaro dependencies and rebuild: `npm run deps`.
1. Clone the Kilotest repository into a new directory on host `K`.
1. In that directory, install the Kilotest dependencies: `npm install`.
1. Copy the `env.testaro` file from the `kilotest` directory to `.env` in the `testaro` directory and replace the `__placeholder__` values in `.env` with actual values.
1. Copy the `env.example` file in the `kilotest` directory to a new `.env` file in the same directory and replace the `__placeholder__` values in `.env` with actual values. `TESTARO_WORKERS` is a JSON object mapping each Testaro worker's ID to an object with its `secret` and its `name`; the ID and secret for a worker must match the `NETWATCH_URL_WORKER_ID` and `NETWATCH_URL_AUTH` values in that worker's `.env`. A worker authenticates each request with an HTTP Basic `Authorization` header (`id:secret`, base64-encoded); as of this writing that header is not yet sent by the published Testaro package, so this scheme requires a matching update to Testaro's `netWatch.js` request code (only to send the header; no change to Testaro's handling of jobs or reports is needed). The ID is a credential and is never published; the `name` is written by Kilotest into a job's and report's `sources.worker` property, which Testaro does not read or alter, so it is a distinct property from `sources.agent` (Testaro's own, untrusted, self-reported label, which Kilotest ignores). Choose a `name` that is safe to appear in every report Kilotest serves. `ALLOW_INTERNAL_TARGETS` controls whether this deployment can be induced to test pages at private, loopback, or link-local addresses; see [`SERVICE.md`](docs/SERVICE.md#testing-target-restrictions) before changing it from its default.

### Usage

1. In the `testaro` directory, make Testaro start listening for jobs: `node call netWatch true nn true`, where `nn` is the number of seconds to wait between checks for new jobs. Note that Kilotest promises nearly immediate review and, on approval, immediate execution of “orders” for tests and retests, with typical total elapsed time 2 to 4 minutes. That promise implies a promise to keep `nn` small. A reasonable value is between 10 and 20.
1. In the `kilotest` directory, start the Kilotest service: `node index`.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.

## Making Kilotest a service

See the [`SERVICE.md`](docs/SERVICE.md) file for instructions on how to make Kilotest a service.

## Using Kilotest as an AI tool

Kilotest is not only a web application but also an API and an MCP server. AI platforms and models can use Kilotest via those interfaces.

The public URL for models using the MCP server at `kilotest.com` is `https://kilotest.com/mcp`. The MCP server is registered at several registries. See [AI-TOOLS.md](docs/AI-TOOLS.md#External-features) for details.

There is additional documentation at:

- [Tutorial: authorizing AI assistants to use Kilotest](https://kilotest.com/tutorialAI.html)
- [AI-TOOLS.md](docs/AI-TOOLS.md): how Kilotest implements the MCP protocol
- [Summary of Kilotest capabilities](https://kilotest.com/capability.md)
- [llms.txt](llms.txt): basic documentation for LLMs
- [llms-full.txt](llms-full.txt): comprehensive documentation for LLMs
- [lhm.plugin.json](lhm.plugin.json): documentation for registration with the LobeHub MCP Market

## Maintenance

These are the routine steps for maintaining Kilotest as currently deployed.

### No API changes

When you make a change in a feature branch **without** any API or tool contract change:

1. Stage, commit, and optionally push all changes.
2. Execute `npm run prePR -- <level>` (`major`, `minor`, or `patch`).
3. Submit a pull request.
4. When all checks succeed, squash-merge to `main` and delete the feature branch on GitHub.
5. Execute `npm run postPR` (with interactive browser authentication).
6. Wait until `npmjs.com` has processed the publication.
7. Use `git pull`, `npm ci`, and `pm2 restart kilotest` (but **not** `npm audit fix`) to deploy the revised `main` branch on the public server.

### API changes

When you **make an API or tool contract change** in a feature branch:

1. `lhm.plugin.json`: Transform it to match `api/schemas.ts` and `mcp.ts`.
2. `llms.txt`, `llms-full.txt`, `capability.md`, `README.md`: Update parameter and path names.
3. Stage, commit, and optionally push all changes.
4. Execute `npm run prePR -- <level>` (`major`, `minor`, or `patch`).
5. Submit a pull request.
6. When all checks succeed, squash-merge to `main`.
7. Execute `npm run postPR` (with interactive browser authentication).
8. Wait until `npmjs.com` has processed the publication.
9. Use `git pull`, `npm ci`, and `pm2 restart kilotest` (but **not** `npm audit fix`) to deploy the revised `main` branch on the public server.
10. Visit the [RapidAPI Studio](https://rapidapi.com/studio) and update the API definition at `Hub Listing` → `Definitions` → `CI/CD` → `Import OpenAPI` by uploading the regenerated `openapi-3.0.yaml`.

If any step fails, see the details in `docs/AI-TOOLS.md` for troubleshooting instructions.
