---
date: 2026-07-14
status: accepted
---

# API design

## Context and problem

Kilotest manages data that are organized into reports. Each report contains the results of one session in which multiple rule engines were used for testing the front-end quality of one web page.

The UI offers users opportunities to influence and interrogate the data managed by the application. Users do this with input via links and forms. The output is HTML. UI users are typically humans.

The opportunities to interrogate the data in the UI are organized as a hierarchy of granularity:

1. All available reports
2. Details of one report, including summaries of the reported issues.
3. Details of one issue, including summaries of its violators.
4. Details of one violator, including its diagnoses.

A violator of an issue is a particular element (HTML, SVG, etc.) on the page. When a rule engine reports a violation of one of its rules, the rule engine usually identifies an element as responsible for that violation. If the rule classifier used by Kilotest classifies that rule as belonging to a particular issue, then Kilotest refers to that element as a violator of that issue.

This hierarchical design is based on a realistic assumption about how human users interact with Kilotest. They visit its home page and begin what to them is a session. Although requests to Kilotest are stateless, the response at each level includes links that contain all the specifications required for a request at the next level. For example, the response to a request at level 3 includes, for each violator, a link that makes a request at level 4 and includes identifiers of the page, the issue, and the violator.

The responses to requests in the UI at any level include some of the information about the previous levels. For example, a response at level 3 includes a summary of information about the report and about the issues in that report. The prior-level summarized information is based on assumptions about what a typical human user would value. For example, at level 3, the prior-level information does not summarize all the available reports, but does include a list of the rule engines that succeeded and failed in testing the page and the counts of issues reported.

These assumptions for human UI users may or may not be valid for how API consumers prefer to interact with a Kilotest API. Those interactions may vary depending on the tasks that they are performing. Consider three scenarios:

1. A user asks a language model for all available information about the front-end quality of a particular web page.
2. A user asks a language model for all the available information about issues related to a particular topic, such as keyboard navigation, for a particular web page.
3. A user asks a language model to describe the front-end quality of a particular web page. Having consumed the description, the user asks the model to describe one of the reported issues. Having consumed that description, the user asks the model to describe one of the reported violators of that issue. Having consumed that description, the user asks the model to describe the diagnoses of that violation.

Scenario 1 seems to justify an API that can aggregate all information from all available reports about the page into a single response.

Scenario 2 seems to justify an API that filters out from the scenario-1 response all information about issues unrelated to the specified topic.

Scenario 3 seems to justify an API that mimics the UI in structure.

Even these apparently justified API designs depend on the assumption that users mean what they say. For example, in scenario 1 a user asks for **all** available information about the front-end quality of a particular web page. The user may really want all that information only if it is not too voluminous, and otherwise want a summary.

Uncertainty about how consumers will interact with the API creates a design problem: How should the API be further developed?

As of the date of this decision, a partial initial API version already exists: an API that mimics the UI for levels 1, 2, and 3. It is exposed as a traditional HTTP REST API and also as a connector to a collection of MCP tools. For each level, the API provides an operation.

## Considered options

1. **Iterate and instrument.** (1) Finish redesigning the operations at levels 1, 2, and 3, to represent the hypothesized typical needs of language-model consumers. Then (2) add an operation that implements level 4. Then (3) add an operation that collects comments from consumers on how the API design could better satisfy their needs. Then (4) add metrics to make API usage and submitted comments available to Kilotest managers.
2. **Research first.** (1) Pause further API development while doing fundamental research to predict consumer needs. Then (2) resume API and metrics development, including API redesign if the research results warrant.

## Decision

The decision is to adopt **option 1: iterate and instrument**.

## Empirical basis

The decision is based on the working hypothesis that the typical consumer will be a language model (most often a foundation model) performing a task for a human user. Even without a pause for fundamental research, there is enough empirical evidence to justify this decision.

### Completion of the 4-level hierarchy

There is empirical support for an API optimized for scenario 3, i.e. incremental rather than one-shot interrogation. Both single-shot comprehensive requests and incremental drill-downs occur in significant numbers in real-world language-model use.

- Jian _et al._ (2024) studied experienced ChatGPT users and found that **43.8% of prompts were single-component**, **38.2% were dual-component**, and only **18.0% were multi-component**. A request such as scenario 1 (“tell me everything about page X”) or scenario 2 (“tell me about defect class X on page Y”) is structurally common because it is typically a single-component prompt.
- However, follow-up refinement is frequent. Mysore _et al._ (2025) analyzed large-scale Bing Copilot and WildChat writing sessions and report: “Rather than passively accepting output, users actively refine, explore, and co-construct text.” This matches scenario 3.

For scenario 3, current patterns do not require the consumer to restart at level 1. Anthropic’s tool-using agent documentation describes an agentic loop in which the full conversation history is kept and “every turn sees the complete prior context”. Cohere’s multi-step tool-use documentation explains that the model can use information learned from one tool call to parameterize a subsequent call. MCP’s typed tool schemas support this pattern. Therefore the existing hierarchy can be expected to be practical in scenario 3.

### Usage and suggestion metrics

There is also empirical support for modesty in any estimate of the adequacy of the current or any other single API design. As found by Zhu _et al._ (2025), “users do not transfer existing conversational norms to LLM interactions, but instead develop new registers with distinct pragmatic features.” Metrics will help to inform the contributors to the API about how consumers are actually using it and about proposed improvements.

## Cost and context-window constraints

A user-friendly rendering of an entire Kilotest report is estimated at about 5 MB of text, or roughly 1.25 million tokens. For a cost estimate, we can use one major frontier model as of the date of this decision (Claude 3.5 Sonnet). On that basis, the report size exceeds the 200,000-token context window of the model, so the model cannot consume the whole report in one prompt. If it is passed chunked, each pass will cost roughly $3.75 in input tokens. Every subsequent question about it will require re-sending it. By contrast, a four-level drill-down through report → issue → violator → diagnosis costs roughly $0.07 for a typical path.

These estimates can be applied to a hypothetically typical conversation. It would involve one report, two issues, and six violators (two per issue). The user would not ask about diagnoses. Delivering such results with the full-report method requires one pass to identify the report, two passes to describe the issues, and six passes to describe the violators, for a total of about $33.75. Doing so incrementally costs about $0.26, which is only **1/130th** of the cost of the same result with the full-report strategy.

On the basis of these cost estimates, even if a user initially wanted a comprehensive report and then wanted a language model to interpret it, the impact of that strategy on cost would likely motivate the user to switch to an incremental strategy as a default.

## Sub-decision: ancestor information in level responses

Given this decision, a secondary decision to make is what information from prior levels to repeat in a response. Four alternatives were considered:

1. **Identifiers only:** The report, issue, and violator would be described by their unique identifiers only. The consumer would use the identifiers to retrieve from its conversation-history context any forgotten information needed about them.
2. **Identifiers plus labels:** Ancestor entities (report, issue, and/or violator) would be described only by their unique identifiers and human-interpretable labels. If the consumer needs other forgotten facts about them, it would use the identifiers to retrieve those facts by repeating ancestor requests.
3. **Currently pertinent facts:** The facts from ancestor requests would be repeated if, and only if, the consumer could need them for interpreting the response to the current-level request. For example, if the current-level request is about one report, facts about other reports are not pertinent, but any facts about the report are pertinent. Likewise for one issue or one violator.
4. **Cumulative facts:** All the information from the prior responses would be repeated, so that any needed information would be available in the current response and no search of the conversation history would be needed.

The sub-decision was **currently pertinent facts** (option 3). This decision was based on cost and reliability, as follows.

- **Cost:** Option 3 is slightly more costly than option 2 when all pertinent facts are remembered, because it provides duplicate information. But option 3 is substantially less costly than option 2 if needed facts are forgotten, because option 3 avoids the need to repeat an ancestor request to re-retrieve forgotten facts. Option 4 is much more costly than option 3, because of the much larger response bodies and the inclusion of much irrelevant information in responses.
- **Quality:** Option 2 provides better locality than option 1, and option 3 provides better locality than option 2. Locality improves the probability that a language model will actually make use of pertinent facts instead of ignoring them or fabricating hallucinated replacements for them.
- **Reliability:** Option 1 entails a greater risk of information loss and hallucination than option 2. With option 1, the consumer could be unable to retrieve the needed information using identifiers if the conversation history were truncated, if an operation were invoked in isolation, or if the model were asked later to summarize findings in natural language.

No sub-decision option is optimal under all possible conditions, but the working hypothesis about prevailing use patterns favors option 3.

## Implementation plan

- The existing request handlers for levels 1, 2, and 3 will be revised. After revision, they will omit excess information about prior levels and include all currently pertinent facts.
- Level 4 will be implemented. It will return the diagnoses for one violator of one issue in one report.
- A comment operation will be provided. This will allow consumers to report friction or suggest improvements to the API design.
- Usage metrics will be defined, captured, and recorded. This will allow Kilotest managers to observe which levels, issues, and patterns are most common and what comments have been received.
- If the empirical data later show that the API does not serve some common scenario well, the API will be redesigned accordingly.

### Risks and mitigations

- **Risk:** The hierarchy may not match the way consumers actually want to query the data.
  - **Mitigation:** The comment operation and usage metrics will surface mismatches early, allowing Kilotest managers to make data-driven decisions about API improvements.
- **Risk:** The cost estimates assume the typical consumer preserves conversation history. A poorly implemented consumer could still incur higher-than-necessary costs.
  - **Mitigation:** It is hypothesized that typical consumers will be models that maintain message history. When they do not, the ancestor labels provide a minimal human-friendly substitute that facilitates history reconstruction when needed.
- **Risk:** Scenario 1 consumers may still want an aggregated “everything about page X” response.
  - **Mitigation:** A future operation can be added to aggregate the hierarchy on the server side and return a structured summary. That decision is deferred until usage and comment data justify it.

## References

- Jian, J., _et al._ (2024). [Understanding User Prompting Behavior in Generative AI](https://dl.acm.org/doi/abs/10.1002/pra2.1318).
- Mysore, S., _et al._ (2025). [Prototypical Human-AI Collaboration Behaviors from LLM-Assisted Writing in the Wild](https://aclanthology.org/2025.emnlp-main.852/).
- Zhu, S., _et al._ (2025). [Show or Tell? Modeling the evolution of request-making in human-LLM conversations](https://arxiv.org/html/2508.01213v2).
- Anthropic. [Tutorial: Build a tool-using agent](https://platform.claude.com/docs/en/agents-and-tools/tool-use/build-a-tool-using-agent).
- Cohere. [Multi-step Tool Use](https://docs.cohere.com/docs/tool-use-usage-patterns#multi-step-tool-use).
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
