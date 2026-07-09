---
date: 2026-07-09
status: proposed
---

# API design

## Context and problem

The UI of Kilotest offers to human non-manager users opportunities to influence and to interrogate the data managed by the application. The data are orgnized into reports. Each report contains the results of one session in which the 10 rule engines were used for testing the front-end quality of one web page.

The opportunities to interrogate the data are organized as a hierarchy of granularity:

1. All available reports
2. All issues from one report
3. All violators of one issue from one report
4. All diagnoses for one violator of one issue from one report

A violator is a particular element (HTML, SVG, etc.) on the page that some rule engine reported having violated a particular rule of the rule engine. If the rule classifier used by Kilotest classifies that rule as belonging to a particular issue, then that element is referred to as a violator of that issue.

This hierarchical design is based on a realistic assumption about how human users interact with Kilotest. They visit its home page and begin what to them is a session. Although requests to Kilotest are stateless, the response at each level includes links that contain all the specifications required for a request at the next level. For example, the response to a request at level 3 includes, for each violator, a link that makes a request at level 4 and includes identifiers of the page, the issue and the violator.

This assumption for human UI users may or may not be valid for how LLMs interact with the Kilotest API. Those interactions may vary depending on the tasks that they are performing. Consider two scenarios:

1. A user asks an LLM for all available information about the front-end quality of a particular web page.
2. A user asks an LLM for all the available information about issues related to a particular topic, such as keyboard navigation, for a particular web page.
3. A user asks an LLM to summarize the front-end quality of a particular web page; having consumed the summary, asks the LLM for a summary of information about one of the reported issues; having consumed that summary, asks the LLM for a summary of information about one of the reported violators of that issue; and, having consumed that summary, asks the LLM for a summary of information about the diagnoses for that violator of that issue.

Scenario 1 seems to justify an API that can aggregate all the information about the latest report about the page into a single response.

Scenario 2 seems to justify an API that offers enough information about all the available reports and all the defined issues to allow the LLM to make a request at level 3 for a particular report.

Scenario 3 seems to justify an API that mimics the UI.

This uncertainty about how LLMs will interact with the API creates a design problem. How should the API be further developed?

As of the date of this decision, a partial initial API version already exists: an API that mimics the UI for levels 1, 2, and 3. For each level, the MCP server provides a tool.

## Considered options

- Add a tool that implements level 4, then add a tool that asks LLMs to comment on how the API design could better satisfy their needs, then add metrics to make API usage and submitted LLM comments available to Kilotest managers.
- Pause further API development while doing fundamental research to predict LLM needs, then resume API development, including redesign if the research results warrant.

## Decision

### Evaluation
