# Kilotest capability manifest

## Capability

Web-page front-end quality audit. Kilotest tests web pages for front-end quality, namely accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG, and makes structured findings available for retrieval.

## Purpose

Language models and AI platforms often need accurate, page-specific data about the front-end quality of a web page to answer user questions. Any single rule engine, such as `axe-core`, `QualWeb`, or `WAVE`, provides such data, but with a large coverage gap. Orchestrating and reconciling numerous complementary rule engines would be difficult. Kilotest solves that problem by testing pages with an ensemble of numerous independent rule engines, making their results comparable, saving the results as JSON reports, and mining the reports for facts at selectable levels of detail.

## Interfaces

- MCP server (Streamable HTTP): `https://kilotest.com/mcp`
- OpenAPI specification: `https://kilotest.com/openapi.yaml`
- HTTP API: see `https://kilotest.com/openapi.yaml` for endpoints
- Web UI: `https://kilotest.com/`
- LLM documentation: `https://kilotest.com/llms.txt` and `https://kilotest.com/llms-full.txt`

## Initial input

A request for a list of tested sites.

## Initial output

A list of tested sites, with URLs for listing the tested pages of each site, which in turn link to their test results.

## Subsequent inputs

- A request for the list of the tested pages of the site of the wanted page.
- If there is no report about the wanted page, a request for a new test, with either the identifier of its site, if the site has been tested, or else the name of its site, the name of the page, its URL, a reason for testing it, and whether to review the request immediately.
- If there is already a report about the wanted page, requests for findings from the report at successive levels of detail, or, if the report is deemed obsolete, a request for a retest, with a reason for retesting it and whether to review the request immediately.
- Complaints and suggestions about reported rule violations and about features of Kilotest.

## Subsequent outputs

- From a request for a new test or a retest **without** immediate review: if valid, confirmation of receipt. If the request is approved by management and executed, the list of available reports will include the new report, typically in 1 hour to 1 day.
- From a request for a new test or a retest **with** immediate review: if valid, confirmation of receipt and immediate approval or rejection, unless the page or its site may already have been tested, in which case the request is referred to management review and the output lists the pages and sites that may already have been tested. If the request is approved, the output will include the identifier of the forthcoming report and two methods for getting the report: (1) allowing time (2 to 4 minutes) for completion of the report and then requesting results, and (2) making a request whose response will await the report and then link to its results. Immediate review is enabled in the MCP and API interfaces only.
- From a request for results: Details at several granularities about issues reported, related WCAG standards, what rules were violated, and which DOM elements violated them.
- From complaints and suggestions about violation diagnoses and features: acknowledgment of receipt and of the manager being notified.

## Side effects

Kilotest reads the specified web page during testing. It does not modify the target site.

## Cost

Free. No authentication is required for the web UI or the public MCP endpoint.

## License

MIT.

## Repository

`https://github.com/jrpool/kilotest`

## Privacy

Kilotest requires no account. See the [privacy policy](https://kilotest.com/privacy.html).
