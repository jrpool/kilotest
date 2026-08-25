# Kilotest

An ensemble testing and reporting service for front-end web quality

## Features

This application uses an ensemble of 10 rule engines to test public web pages for front-end quality (i.e. accessibility, usability, and standards conformity).

The testing paradigm employed by Kilotest is discussed in these papers:

- [How to run a thousand accessibility tests](https://medium.com/cvs-health-tech-blog/how-to-run-a-thousand-accessibility-tests-63692ad120c3)
- [Testaro: Efficient Ensemble Testing for Web Accessibility](https://arxiv.org/abs/2309.10167)
- [Accessibility Metatesting: Comparing Nine Testing Tools](https://arxiv.org/abs/2304.07591)

Kilotest acts as a web server for human users, an MCP server for AI platforms, and an API for programmatic access.

Testing for Kilotest is performed by one or more testing agents that obtain jobs from Kilotest, perform them, and send reports of the results back to Kilotest. Those agents are instances of the [Testaro](https://www.npmjs.com/package/testaro) package.

An active production instance of Kilotest may require multiple testing agents to handle the load, because testing one web page typically takes about 3 minutes and agents test only one page at a time.

## Getting started locally with 1 testing worker

### Installation

In the steps below, hosts `T` and `K` may be the same host or two different hosts. Host `T` can be a Debian stable, Ubuntu LTS, Windows, or macOS host. Host `K` can be any server host that can run the latest LTS version of Node.js. If hosts `T` and `K` differ, then they must be open to `https` traffic and host `K` must permit `https` requests from host `T`.

1. Clone the [Testaro project](https://github.com/jrpool/testaro) into a new directory on host `T`.
1. In that directory, install the Testaro dependencies: `npm install`.
1. Update the Testaro dependencies and rebuild: `npm run deps`.
1. Clone the Kilotest repository into a new directory on host `K`.
1. In that directory, install the Kilotest dependencies: `npm install`.
1. Copy the `env.testaro` file from the `kilotest` directory to `.env` in the `testaro` directory and replace the `__placeholder__` values in `.env` with actual values.
1. Copy the `env.example` file in the `kilotest` directory to a new `.env` file in the same directory and replace the `__placeholder__` values in `.env` with actual values. `TESTARO_WORKERS` is a JSON object mapping each Testaro worker's ID to an object with its `secret` and its `name`; the ID and secret for a worker must match the `NETWATCH_URL_WORKER_ID` and `NETWATCH_URL_AUTH` values in that worker's `.env`. A worker authenticates each request with an HTTP Basic `Authorization` header (`id:secret`, base64-encoded); as of this writing that header is not yet sent by the published Testaro package, so this scheme requires a matching update to Testaro's `netWatch.js` request code (only to send the header; no change to Testaro's handling of jobs or reports is needed). The ID is a credential and is never published; the `name` is written by Kilotest into a job's and report's `sources.worker` property, which Testaro does not read or alter, so it is a distinct property from `sources.agent` (Testaro's own, untrusted, self-reported label, which Kilotest ignores). Choose a `name` that is safe to appear in every report Kilotest serves.

### Usage

1. In the `testaro` directory, make Testaro start listening for jobs: `node call netWatch true nn true`, where `nn` is the number of seconds to wait between checks for new jobs.
1. In the `kilotest` directory, start the Kilotest service: `node index`.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.

## Making Kilotest a service

See the `SERVICE.md` file for instructions on how to make Kilotest a service.

## Using Kilotest as an AI tool

Kilotest is not only a web application but also an API and an MCP server. AI platforms and models can use Kilotest via those interfaces.

The URL for models using the MCP server is `http://kilotest.com/mcp`. The MCP server is listed at these services:

- [Smithery](https://smithery.ai/servers/pool/kilotest)
- [Glama](https://glama.ai/mcp/connectors/com.kilotest/kilotest)

There is additional documentation at:

- [AI-TOOLS.md](AI-TOOLS.md)
- [llms.txt](llms.txt)
- [llms-full.txt](llms-full.txt)
- [QAI](https://kilotest.com/qai)
