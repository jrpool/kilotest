# Kilotest as connector to and creator of AI Tools

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application performing a service for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could also act as a connector to tools for use by language models. Language models are asked for help in all domains, including the domain of software quality. When asked about the front-end quality (accessibility, usability, and standards conformity) of specific web pages, models gave answers without the use of tools. The answers were at best fragmentary but often speculative and fabricated. If Kilotest offered to connect language models to its functionalities as tools, models could give more inexpensive, comprehensive, factual, authoritative, and grounded answers. Every reported defect could be documented and ascribed to one or more specific rule engines in the Kilotest ensemble.

Given the potential of Kilotest to serve language models and the expected continued growth in the share of questions that are directed to AI platforms that use language models, a decision was made to **make Kilotest discoverable, usable, and, where appropriate, used as a connector to, and creator of, tools for language models**.

## Terms

- **Language model**: A model (e.g., Claude Haiku 4.5, Kimi K2.6, GPT-5.4, Gemini 3.1 Pro) that can consume and generate text, images, or other content.
- **AI platform**: A platform (e.g., Claude Desktop, Perplexity, ChatGPT, Gemini 3.5 Flash) that gives human users access to the services of language models and connects language models to productivity resources.
- **tool**: A specialized productivity resource providing a capability that the language model itself needs but does not have. In the OpenAPI specification, the term _operation_ is used to mean tool.
- **connector**: A service that allows AI platforms to enable their language models to discover, evaluate, and use tools.

Tools can be independent of connectors that connect them to language models, but Kilotest can be both. It already provides capabilities to human users; it can re-use the same functions that underlie those capabilities and reconfigure those functions as tools for language models. Kilotest can also provide connectors to those tools for language models and make those connectors compatible with AI platforms.

## Internal additions

The internal changes that have been made in the Kilotest codebase to support the use of Kilotest as a set of tools and connectors to them are:

- An API, consisting of:
  - Additions to `index.js`.
  - Additions to `util.js`.
  - Within directories providing API functionality:
    - `api.js` modules.
    - `util.js` modules, if needed, containing resources shared by the `index.js` and `api.js` modules in those directories.
- A [`JSON-LD`](https://json-ld.org/) script in the `index.html` file, providing structured data about the Kilotest API.
- Additions to the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- An `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- An `mcp.js` file, providing an MCP server for Kilotest.
- A `sitemap.xml` file.
- Additions to the `README.md` file.
- This `AI-TOOL.md` file.
- A `researchAgent.js` file, testing the API.

## External actions

The external actions that have been taken to support the use of Kilotest as an AI tool are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- A [request](https://rapidapi.com/studio/api_91f2ce07-2572-48bd-a34d-ff01ed6cd039/publish/general) to add Kilotest to the Rapid API Hub.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- [Configuration of Claude Desktop](https://github.com/ivo-toby/mcp-openapi-server#option-1-using-with-claude-desktop-stdio-transport) on the local development host to connect Claude Desktop models to Kilotest tools.
- Deployment of an MCP server in HTTP mode on the Kilotest service host.

## Use cases

The rationale for Kilotest as a connector to tools for language models is set forth in the `llms-full.txt` file and is not repeated here.

Some common anticipated use cases for this role are:

1. A user of a web-builder platform with responsibility for a website asks an AI platform for help in creating or improving the website.
1. A prospective customer of a web development service asks an AI platform to evaluate the quality of websites in the portfolios of candidate vendors.
1. A professional web developer within an organization asks an AI platform for a code review.
1. A risk-management professional within an organization asks an AI platform to report on any web accessibility defects that could expose the organization to prosecution or civil litigation for disability discrimination.
1. A person who depends on web accessibility because of disabilities asks an AI platform to provide documentary support for a complaint to the owner of a website about accessibility defects.
1. A disability-rights advocate or attorney concerned with inaccessibility in a particular industry asks an AI platform to perform a front-end-quality comparison of some websites in that industry.

Among these use cases, case 3 would make it feasible for the user to tell an AI platform explicitly and formally that Kilotest is an available connector to tools that are relevant to the task. All 5 of the other use cases would not make that feasible. In those 5 use cases, the user has a question but relies on the AI platform to know or discover which relevant connectors exist, to select appropriate connectors, and to provide language models that can use those connectors and tools that they connect to.

Use cases 1, 2, 4, 5, and 6 exemplify a widespread expectation and demand for AI platform capability. The commonality is: “I have a question; answer it.” If Kilotest can be employed as an expert for AI platforms in relevant cases, platforms will be more successful in satisfying that demand. At present this is a difficult problem because of platform limitations and a lack of standardization.

## Strategy

The Kilotest project is attempting to solve the just-described problem. That attempt follows the following strategy.

### Increments

Connector and tool discovery and utilization have been only partly standardized. Major differences in protocols exist among model and platform families. Therefore, small testable increments of improvement in the connector and tool functionality of Kilotest can best be defined by model and platform family and by use-case characteristics.

One benefit of such incrementalism is that, after the first increment succeeds, it becomes possible to make and test external changes publicizing the fact that a particular platform-model combination delivers unprecedentedly inexpensive, comprehensive, and truthful answers in a particular class of use cases to questions about front-end web quality.

Another benefit is that subsequent increments can be defined incrementally rather than in advance. Lessons learned from the work on each increment can inform the choice of what to work on next.

#### Increment 1

In the first increment, the objective was to make Anthropic Claude models use Kilotest to help them answer questions from developers using the Claude Desktop application for use case 3, where the code in question is already deployed as a public web page.

As mentioned above, Claude Desktop was installed on the local development host and then configured for Kilotest. That configuration consisted of the addition of a property to the Claude Desktop configuration file, located at `~/Library/Application Support/Claude/claude_desktop_config.json`. The added property is:

```json
"mcpServers": {
  "kilotest": {
    "command": "npx",
    "args": [
      "-y",
      "@ivotoby/openapi-mcp-server",
      "--disable-abbreviation",
      "true"
    ],
    "env": {
      "API_BASE_URL": "https://kilotest.com",
      "OPENAPI_SPEC_PATH": "https://kilotest.com/openapi.yaml"
    }
  }
},
```

That configuration notifies models that Kilotest is available as an MCP server, but does not explain what tools it provides, what they are useful for, or how to use them.

Experimentation revealed that Claude Sonnet 4.6 with Medium effort chose to use Kilotest when answering questions about the accessibility and usability of particular public web pages. Low effort did not result in the use of Kilotest. The less capable Claude Haiku model did not use Kilotest.

### Increment 2

Increment 2 somewhat lightens the burden on the user by shifting the user environment from an installed application to a web browser, and by providing an easier interface for users to tell the platform about Kilotest. The platform is the `claude.ai` web application instead of Claude Desktop. Instead of editing a JSON file, the user tells the platform about Kilotest with a setting.

The investigation began with the addition of Kilotest as a _connector_ to the `claude.ai` web application. The user used the `Customize/Connectors/Add connector/Add custom connector` interface, providing these data before activating the `Add` button:

- Name: Kilotest
- Remote MCP server URL: `https://kilotest.com/mcp`

When the connector configuration with tools appeared, the user changed the all tool permissions from `Needs approval` to `Always allow`.

Then the user asked the platform, “I want to know whether the home page of the nonprofit organization named ‘Open Secrets’ has quality defects, such as with accissibility [_sic_] and usability.”

An earlier trial had revealed that the least powerful model, Claude Haiku 4.5 without the Extended capability, did not consider using any tools.

For this trial, then, the user selected Claude Haiku 4.5 with Extended capability.

The record of thinking began with:

```text
The user is asking about the quality of the home page for a nonprofit organization called "Open Secrets," specifically regarding accessibility and usability defects.
This is asking for a quality assessment of a web page. Looking at my available tools, I have access to Kilotest, which has tools for analyzing web page quality:

Kilotest:describeQualityOfOneWebPage — Returns data from a specified Kilotest report about issues of front-end quality
Kilotest:recommendQualityTestingOfOneWebPage — Recommends a web page for Kilotest to test for front-end quality
Kilotest:summarizeQualityOfAllTestedWebPages — Returns summary data from every available Kilotest report

I should first use the recommendQualityTestingOfOneWebPage tool to see if I can get Kilotest to test the Open Secrets home page for quality issues including accessibility and usability.
First, I need to find the correct URL for Open Secrets. Open Secrets is a well-known nonprofit that tracks money in politics. Their homepage should be at opensecrets.org. Let me use the Kilotest tool to request that they test this page for quality issues.
```

As shown, the discovery was immediate, but the utilization strategy was confused. The sequencing instructions failed to shape the model’s utilization planning at first.

The model then output:

`I can help you assess the quality of the Open Secrets home page using Kilotest, which specializes in finding accessibility and usability defects. Let me recommend their home page for testing.`

After contemplating this errant plan, the model then corrected its thinking and resumed with `Good! I now have access to the Kilotest tools. Let me first check if there's already a report on the Open Secrets home page by calling summarizeQualityOfAllTestedWebPages.`.

The thinking record continues with the Kilotest logo and `Summarize quality of all tested web pages`, the `annotations.title` property of the appropriate tool, followed by the complete output of that tool, and then:

```text
Great! I found the Open Secrets website has already been tested by Kilotest. Here's the information:
Identifier: 260519T1437-79l
Creation date: 2026-05-19T14:37:00.000Z (33 days ago from June 21)
URL: https://www.opensecrets.org/
Number of issues reported: 80
Number of HTML elements reported as exhibiting issues: 1631
Rule engines that reported issues: 9 (Accessibility Checker, Alfa, ASLint, Axe, Editoria11y, Html Checker API, HTML CodeSniffer, QualWeb, Testaro)

Now I should call the describeQualityOfOneWebPage tool to get the detailed information about these quality defects.
```

The model then output: `Great news! I found that Open Secrets' home page has already been tested by Kilotest. Let me get the detailed quality report for you.`

The thinking record continued with `Synthesized accessibility audit findings to assess website quality defects`, the Kilotest logo, the title of the next tool (`Describe the quality of one web page`), and the complete result of that tool call.

The final segment of the thinking record contained:

```text
Perfect! Now I have a detailed report about the Open Secrets home page. Let me synthesize this information to provide a comprehensive answer to the user. The report shows:

Total issues: 80
18 highest priority issues
23 high priority issues
10 low priority issues
29 lowest priority issues
1,631 HTML elements with issues

Key defects include:

Images without text (12 elements) - major accessibility issue
Links without names (4 elements) - critical for accessibility
Duplicate IDs (689 elements!) - this is a huge problem
Elements that are focusable but hidden (14 elements)
Buttons without text (8 elements)
Poor contrast (60 elements)
Visible labels not in accessible names (39 elements)
Invalid roles (28 elements)
Various usability issues like poor focus indication, small targets, etc.

The most critical issues are those marked as "highest priority" which relate to WCAG 2.2 success criteria.
```

This record shows the model adding its own knowledge and judgment to the Kilotest results.

The final output to the user was:

```markdown
## Open Secrets Home Page Quality Assessment

Based on Kilotest's comprehensive testing of **https://www.opensecrets.org/**, the home page has **significant accessibility and usability defects**. Here's what was found:

### Overall Quality Summary

- **Total Issues Reported:** 80
- **HTML Elements with Issues:** 1,631
- **Priority Breakdown:**
  - 18 highest priority issues
  - 23 high priority issues
  - 10 low priority issues
  - 29 lowest priority issues

### Critical Accessibility Issues (Highest Priority)

1. **Missing Image Text** (12 elements)
   - Users cannot understand what images depict
   - Violates WCAG 2.2 criterion 1.1.1

2. **Links Without Names** (4 elements)
   - Users can't tell where links lead
   - Impacts navigation understanding

3. **Duplicate HTML IDs** (689 elements!) ⚠️ **Most Severe**
   - This is the most widespread issue
   - Users may be pointed to wrong page sections
   - Violates WCAG 2.2 criterion 4.1.1

4. **Focusable Elements That Are Hidden** (14 elements)
   - Keyboard-only users cannot navigate properly
   - Disrupts keyboard accessibility

5. **Buttons Without Names** (8 elements)
   - Users cannot understand button purposes

6. **Form Controls Without Labels** (12 elements)
   - Users can't understand how to use forms

7. **Poor Text Contrast** (60 elements)
   - Content is difficult to read
   - Impacts users with low vision

### Significant Usability Issues (High Priority)

- **Visible Labels Not in Accessible Names** (39 elements) — users struggle to find controls
- **Invalid Roles** (28 elements) — assistive technologies misdescribe content
- **Missing Submit Buttons** on forms (6 elements)
- **Nested Controls** (17 elements) — users cannot reliably click intended items

### Additional Readability Issues

- **Poor Focus Indication** (63 elements) — keyboard users can't see where they are
- **Small/Close Targets** (7 elements) — difficult to click on mobile or for users with motor disabilities
- **Low Line Height** (269 elements) — text is cramped and hard to read
- **Small Font Size** (2 elements)
- **Absolute Box Sizes** (121 elements) — prevents text enlargement for readability

### Test Coverage

Nine different accessibility testing engines detected issues, including Accessibility Checker (IBM), Axe (Deque), WAVE (Utah State University), and others. The WAVE tool timed out at 25 seconds, suggesting possible performance issues.

### Recommendations
The **duplicate ID problem** (689 instances) should be addressed first, as it's both widespread and critical to document structure. After that, focus on naming images, links, and form controls, which are foundational accessibility requirements.
```

The model had decided which data from Kilotest to provide with its own elaborations and interpretations, which to provide as-is, and which to summarize.

The results of this increment can be considered a success, including the fact that the model interpreted the misspelled word "accissibility" as "accessibility".

However, some further improvements merit consideration:

- The instructions can be further improved to more reliably deter models from planning to recommend testing a page before learning whether a report about the page is already available. They sufficed in this trial to avoid an unnecessary tool call, but, given the stochastic behavior of models, the initially deviant thinking suggests that might not always be the case.
- The possibility of incorrect attribution to Kilotest of the interpretive content provided by the model can be mitigated with disclaimers, such as “Kilotest makes no recommendations about methods or sequences of issue remediation”, or with advice to models to describe their interpretations as theirs.
