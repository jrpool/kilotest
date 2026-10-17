---
date: 2026-07-14
status: accepted
---

# API design

## Context, problem, and decision

Kilotest manages data that are organized into reports. Each report contains the results of one session in which multiple rule engines were used for testing the front-end quality of one web page.

The API offers existing data as a hierarchy of granularity:

1. All tested pages.
2. Reports available about one page.
3. Details of one report, including summaries of the reported issues.
4. Details of one issue, including summaries of its violators.
5. Details of one violator, including its diagnoses.

It also offers downloads of complete reports in JSON format.

The API would be simpler to implement if it offered only one-shot interrogation, i.e. downloads of complete reports. But the available evidence indicates that this would be inferior for typical users.

Both one-shot comprehensive requests and incremental drill-downs occur in significant numbers in real-world language-model use.

- Jian _et al._ (2024) studied experienced ChatGPT users and found that **43.8% of prompts were single-component**, **38.2% were dual-component**, and only **18.0% were multi-component**. A request such as scenario 1 (“tell me everything about page X”) or scenario 2 (“tell me about defect class X on page Y”) is structurally common because it is typically a single-component prompt.
- However, follow-up refinement is frequent. Mysore _et al._ (2025) analyzed large-scale Bing Copilot and WildChat writing sessions and report: “Rather than passively accepting output, users actively refine, explore, and co-construct text.” This matches scenario 3.

Anthropic’s tool-using agent documentation describes an agentic loop in which the full conversation history is kept and “every turn sees the complete prior context”. Cohere’s multi-step tool-use documentation explains that the model can use information learned from one tool call to parameterize a subsequent call. MCP’s typed tool schemas support this pattern.

Zhu _et al._ (2025) found that “users do not transfer existing conversational norms to LLM interactions, but instead develop new registers with distinct pragmatic features.”

A user-friendly rendering of an entire Kilotest report is estimated at about 5 MB of text, or roughly 1.25 million tokens. That exceeds a typical context window, so a language model cannot consume the whole report in one prompt. On the basis of a 2026 pricing estimate of $0.0005 per 1,000 tokens, if the report is passed chunked, each pass will cost roughly $3.75 in input tokens. Every subsequent question about it will require re-sending it. By contrast, a four-level drill-down through page → report → issue → violator → diagnosis costs roughly $0.07 for a typical path.

These estimates can be applied to a hypothetically typical conversation. It would involve one report, two issues, and six violators (two per issue). The user would not ask about diagnoses. Delivering such results with the full-report method requires one pass to identify the report, two passes to describe the issues, and six passes to describe the violators, for a total of about $33.75. Doing so incrementally costs about $0.26, which is only **1/130th** of the cost of the same result with the full-report strategy.

On the basis of these cost estimates, even if a user initially wanted a comprehensive report and then wanted a language model to interpret it, the impact of that strategy on cost would likely motivate the user to switch to an incremental strategy as a default.

## References

- Jian, J., _et al._ (2024). [Understanding User Prompting Behavior in Generative AI](https://dl.acm.org/doi/abs/10.1002/pra2.1318).
- Mysore, S., _et al._ (2025). [Prototypical Human-AI Collaboration Behaviors from LLM-Assisted Writing in the Wild](https://aclanthology.org/2025.emnlp-main.852/).
- Zhu, S., _et al._ (2025). [Show or Tell? Modeling the evolution of request-making in human-LLM conversations](https://arxiv.org/html/2508.01213v2).
- Anthropic. [Tutorial: Build a tool-using agent](https://platform.claude.com/docs/en/agents-and-tools/tool-use/build-a-tool-using-agent).
- Cohere. [Multi-step Tool Use](https://docs.cohere.com/docs/tool-use-usage-patterns#multi-step-tool-use).
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
