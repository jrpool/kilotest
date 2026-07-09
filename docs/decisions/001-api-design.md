---
date: 2026-07-09
status: proposed
---

# API design

## Context and problem

The UI of Kilotest offers human non-manager users opportunities to influence and to interrogate the data managed by the application. The data are organized into reports. Each report contains the results of one session in which 10 rule engines were used for testing the front-end quality of one web page.

The opportunities to interrogate the data in the UI are organized as a hierarchy of granularity:

1. All available reports
2. All issues from one report
3. All violators of one issue from one report
4. All diagnoses for one violator of one issue from one report

A violator is a particular element (HTML, SVG, etc.) on the page that some rule engine reported having violated a particular rule of the rule engine. If the rule classifier used by Kilotest classifies that rule as belonging to a particular issue, then that element is referred to as a violator of that issue.

This hierarchical design is based on a realistic assumption about how human users interact with Kilotest. They visit its home page and begin what to them is a session. Although requests to Kilotest are stateless, the response at each level includes links that contain all the specifications required for a request at the next level. For example, the response to a request at level 3 includes, for each violator, a link that makes a request at level 4 and includes identifiers of the page, the issue and the violator.

The responses to requests in the UI at any level include a summary of some of the information about the previous levels. For example, a response at level 3 includes a summary of information about the report and about the issues in that report. The prior-level summarized information is based on assumptions about what a typical human user would value. For example, at level 3, the prior-level information does not summarize all the available reports, but does include a list of the rule engines that succeeded and failed in testing the page and the counts of issues reported.

These assumptions for human UI users may or may not be valid for how LLMs interact with the Kilotest API. Those interactions may vary depending on the tasks that they are performing. Consider three scenarios:

1. A user asks an LLM for all available information about the front-end quality of a particular web page.
2. A user asks an LLM for all the available information about issues related to a particular topic, such as keyboard navigation, for a particular web page.
3. A user asks an LLM to summarize the front-end quality of a particular web page; having consumed the summary, asks the LLM for a summary of information about one of the reported issues; having consumed that summary, asks the LLM for a summary of information about one of the reported violators of that issue; and, having consumed that summary, asks the LLM for a summary of information about the diagnoses for that violator of that issue.

Scenario 1 seems to justify an API that can aggregate all the information about the latest report about the page into a single response.

Scenario 2 seems to justify an API that offers enough information about all the available reports and all the defined issues to allow the LLM to make a request at level 3 for a particular issue in a particular report.

Scenario 3 seems to justify an API that mimics the UI in structure, but perhaps not in the prior-levels information provided at each level.

Even these apparently justified API designs depend on the assumption that users mean what they say, particularly in scenario 1. A user who asks for **all** available information about the front-end quality of a particular web page may do so because of ignorance about how voluminous that information is, and the real wish may be more conditional: all the information if there is not much, but otherwise a summary so I can select what I want to learn more about.

Uncertainty about how LLMs will interact with the API creates a design problem. How should the API be further developed?

As of the date of this decision, a partial initial API version already exists: an API that mimics the UI for levels 1, 2, and 3. For each level, the MCP server provides a tool.

## Considered options

1. **Iterate and instrument.** (1) Add a tool that implements level 4; then (2) add a tool that asks LLMs to comment on how the API design could better satisfy their needs; then (3) add metrics to make API usage and submitted LLM comments available to Kilotest managers.
2. **Research first.** (1) Pause further API development while doing fundamental research to predict LLM needs; then (2) resume API and metrics development, including API redesign if the research results warrant.

## Decision

The decision is to adopt **option 1: iterate and instrument**.

## Empirical basis

The decision is based on the fact that, even without a pause for fundamental research, there is enough empirical evidence to justify this decision.

### Completion of the 4-level hierarchy

There is empirical support for an API that assumes scenario 3, i.e. incremental rather than one-shot interrogation. Both single-shot comprehensive requests and incremental drill-downs occur in significant numbers in real-world LLM use.

- Jian et al. (2024) studied experienced ChatGPT users and found that **43.8% of prompts were single-component**, **38.2% were dual-component**, and only **18.0% were multi-component**. A request such as scenario 1 ("tell me everything about page X") or scenario 2 ("tell me about defect class X on page Y") is structurally common because it is typically a single-component prompt.
- At the same time, follow-up refinement is routine. Mysore et al. (2025) analyzed large-scale Bing Copilot and WildChat writing sessions and report: “Rather than passively accepting output, users actively refine, explore, and co-construct text.” This matches scenario 3.

For scenario 3, current LLM tool-use patterns do not require the model to restart at level 1. Anthropic's tool-use documentation describes an agentic loop in which the full conversation history is kept and “every turn sees the complete prior context”. Cohere’s multi-step tool-use documentation explains that the model can use information learned from one tool call to parameterize a subsequent call. MCP’s typed tool schemas support this pattern. Therefore the existing hierarchy can be expected to be practical in scenario 3.

### Usage and suggestion metrics

There is also empirical support for modesty in any estimate of the adequacy of the current or any other single API design. As found by Zhu et al. (2025), “users do not transfer existing conversational norms to LLM interactions, but instead develop new registers with distinct pragmatic features.” Metrics will help to inform the contributors to the API about how LLMs are actually using it and how they want it to be improved.

## Cost and context-window constraints

A user-friendly rendering of an entire Kilotest report is estimated at about 5 MB of text, or roughly 1.25 million tokens. This exceeds the 200,000-token context window of Claude 3.5 Sonnet, so the model cannot consume the whole report in one prompt. If it could be passed whole, each pass would cost roughly $3.75 in input tokens at current pricing, and every subsequent question about it would require re-sending it. By contrast, a four-level drill-down through report → issue → violator → diagnosis costs roughly $0.07 for a typical path. An intuitive guess is that a typical conversation would involve 1 report, 2 issues, and 3 violators per issue. Delivering such results with the full-report method would require 2 issue passes and 6 violator passes beyond the initial pass, for a total of about $33.75. Doing so incrementally would cost about $0.26, which is only **1/130th** of the cost of the same result with the full-report strategy. Even if a user initially wanted a comprehensive report and then wanted an LLM to find and interpret facts in it, the impact of that strategy on cost would likely motivate the user to switch to an incremental strategy.

## Sub-decision: ancestor information in level responses

Given this decision, a secondary decision to make is what information from prior levels to repeat in a response. Three alternatives were considered:

1. **Identifiers only:** The report, issue, and violator would be described by their unique identifiers only. The LLM would use the identifiers to retrieve from its conversation-history context any information needed about them.
2. **Identifiers plus labels:** The report, issue, and violator would be described by their unique identifiers and human-interpretable labels. If the LLM needs more information about them than what their labels provide, the LLM would use the identifiers to retrieve from its conversation-history context that additional information.
3. **Cumulative responses:** All the information from the prior responses would be repeated, so that any needed information would be available in the current response and no search of the conversation history would be needed.

The sub-decision was **identifiers plus labels** (option 2). This decision was based on cost and reliability, as follows.

- **Cost:** Option 3 would make a four-level drill-down roughly 4 times as expensive as option 2, because of the large response volume.
- **Reliability:** Option 1 would entail a greater risk of information loss and hallucination than option 2, because the LLM could be unable to retrieve the needed information using identifiers if its history were truncated, if a tool were invoked in isolation, or if the model were asked later to summarize findings in natural language.

## Implementation plan

- The existing MCP tools for levels 1, 2, and 3 will be revised to remove excess information about prior levels and include only identifiers and labels for them.
- Level 4 will be implemented as an MCP tool that returns the diagnoses for one violator of one issue in one report.
- A suggestions tool will be provided so that LLM-based clients can report friction or suggest improvements to the API design.
- Usage metrics will be defined, captured, and recorded so that Kilotest managers can observe which levels, issues, and patterns are most common and what suggestions have been received.
- If the empirical data later show that the API does not serve some common scenario well, the API will be redesigned accordingly.

### Risks and mitigations

- **Risk:** The hierarchy may not match the way LLMs actually want to query the data.
  - **Mitigation:** The suggestions tool and usage metrics will surface mismatches early.
- **Risk:** The cost estimate assumes a well-behaved client that preserves conversation history; a poorly implemented client could still incur higher-than-necessary costs.
  - **Mitigation:** MCP clients are expected to maintain message history by protocol; the ancestor labels provide a minimal human-friendly substitute.
- **Risk:** Scenario 1 users may still want an aggregated "everything about page X" response.
  - **Mitigation:** A future tool can be added to aggregate the hierarchy on the server side and return a structured summary, but that decision is deferred until usage data justify it.

## References

- Jian, J., et al. (2024). [Understanding User Prompting Behavior in Generative AI](https://dl.acm.org/doi/abs/10.1002/pra2.1318).
- Mysore, S., et al. (2025). [Prototypical Human-AI Collaboration Behaviors from LLM-Assisted Writing in the Wild](https://aclanthology.org/2025.emnlp-main.852/).
- Zhu, S., et al. (2025). [Show or Tell? Modeling the evolution of request-making in human-LLM conversations](https://arxiv.org/html/2508.01213v2).
- Anthropic. [Tutorial: Build a tool-using agent](https://platform.claude.com/docs/en/agents-and-tools/tool-use/build-a-tool-using-agent).
- Cohere. [Multi-step Tool Use](https://docs.cohere.com/v1/docs/multi-step-tool-use).
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
