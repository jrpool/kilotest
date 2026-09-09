# Kilotest capability manifest

## Capability

Web-page front-end quality audit. Kilotest tests public web pages for front-end quality, namely accessibility, usability, and standards conformity, and makes structured findings available for retrieval.

## Purpose

Language models and AI platforms often need accurate, page-specific data about the front-end quality of a web page to answer user questions. Rule engines, such as `axe-core`, `QualWeb`, and `WAVE`, provide such data, but with large coverage gaps. Orchestrating and reconciling numerous complementary rule engines would be difficult. Kilotest solves that problem by testing pages with an ensemble of numerous independent rule engines, making their results comparable, saving the results as JSON reports, mining the reports for facts at selectable levels of detail.

## Interfaces

- MCP server (Streamable HTTP): `https://kilotest.com/mcp`
- OpenAPI specification: `https://kilotest.com/openapi.yaml`
- HTTP API: see `https://kilotest.com/openapi.yaml` for endpoints
- Web UI: `https://kilotest.com/`
- LLM documentation: `https://kilotest.com/llms.txt` and `https://kilotest.com/llms-full.txt`

## Initial input

A request for a list of available reports.

## Initial output

A list of available reports.

## Subsequent inputs

- If there is no report about the wanted page, a request to test it, with a page description and its URL.
- If there is a report about the wanted page, requests for findings from the report at successive levels of detail.

## Subsequent outputs

- From a request to test a page: confirmation of receipt. Upon approval and execution, the list of available reports will include the new report.
- From a request for findings: Details about issues reported, related WCAG standards, what rules were violated, and which DOM elements violated them.

## Side effects

Kilotest reads the specified public web page during testing. It does not modify the target site. Testing is asynchronous and may take up to approximately one day before reports are available for newly requested pages.

## Cost

Free. No authentication is required for the web UI or the public MCP endpoint.

## License

MIT.

## Repository

`https://github.com/jrpool/kilotest`
