# Kilotest capability manifest

## Capability

Web-page front-end quality audit. Kilotest tests web pages for front-end quality, namely accessibility, usability, and standards conformity, and makes structured findings available for retrieval.

## Purpose

Language models and AI platforms often need accurate, page-specific data about the front-end quality of a web page to answer user questions. Rule engines, such as `axe-core`, `QualWeb`, and `WAVE`, provide such data, but with large coverage gaps. Orchestrating and reconciling numerous complementary rule engines would be difficult. Kilotest solves that problem by testing pages with an ensemble of numerous independent rule engines, making their results comparable, saving the results as JSON reports, and mining the reports for facts at selectable levels of detail.

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

- If there is no report about the wanted page, a request or order for a new test, with a page description, its URL, and a reason for testing it.
- If there is already a report about the wanted page, requests for findings from the report at successive levels of detail, or, if the report is deemed obsolete, a request or order for a retest, with a reason for retesting it.

## Subsequent outputs

- From a **request** for a new test or a retest: confirmation of receipt. If the request is manager-approved and executed, the list of available reports will include the new report, typically within 1 day.
- From an **order** for a new test or a retest: confirmation of receipt and immediate approval or rejection. If the request is approved, the output will include the identifier of the forthcoming report and two methods for getting the report: (1) allowing time (2 to 4 minutes) for completion of the report and then requesting it, and (2) making a request whose response will await the report and then link to it. Orders are enabled in the MCP and API interfaces only.
- From a request for findings: Details about issues reported, related WCAG standards, what rules were violated, and which DOM elements violated them.

## Side effects

Kilotest reads the specified web page during testing. It does not modify the target site.

## Cost

Free. No authentication is required for the web UI or the public MCP endpoint.

## License

MIT.

## Repository

`https://github.com/jrpool/kilotest`
