# Kilotest capability manifest

## Capability

Kilotest is a powerful web validator. It integrates an ensemble of 12 rule engines (Axe, HTML CodeSniffer, QualWeb, Nu Html Checker, etc.), with about 1,300 rules, to audit web pages for front-end quality (accessibility, usability, and W3C web standards, including HTML, CSS, ARIA, and WCAG). Each test job generates a standardized public report describing which elements violated which rules and grouping the violations into about 380 issues. Kilotest can list the tested sites and pages, the reports about each page, the issues in each report, the elements violating rules belonging to each issue, and the diagnoses of each violation. Kilotest also accepts requests to test pages not yet tested and to retest already tested pages. Kilotest features are available via a web UI, an API, and a hosted remote MCP server with streamable HTTP and no authentication.

## Purpose

Language models and AI platforms often need accurate, page-specific data about the front-end quality of a web page to answer user questions. Any single rule engine, such as `Accessibility Checker`, `Alfa`, or `WAVE`, provides such data, but with a large coverage gap. Orchestrating and reconciling numerous complementary rule engines would be difficult. Kilotest solves that problem by testing pages with an ensemble of 12 independent rule engines, making their results comparable, saving the results as JSON reports, and mining the reports for facts at selectable levels of detail.

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

## Exemplar pages

Kilotest hosts a collection of self-documenting exemplar pages, each illustrating defect types with contrasting defect-free counterparts, at `https://kilotest.com/exemplars/`. They are registered as the pages of the “Kilotest exemplars” site and are tested like any other pages, so their reports can be compared with the defects they declare, helping evaluate the rule engines themselves. `listPages` applied to that site lists them.

## Side effects

Kilotest reads the specified web page during testing. It does not modify the target site.

## Cost

Free.

## License

MIT.

## Repository

`https://github.com/jrpool/kilotest`

## Authentication

No authentication is required for the web UI or the public MCP endpoint.

## Privacy

Kilotest requires no account. See the [privacy policy](https://kilotest.com/privacy.html).
