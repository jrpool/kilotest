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
- Deployment of an MCP server in HTTP mode on the Kilotest service host.
- Configuration of Claude Desktop on the local development host and the `claude.ai` web application to connect Claude Desktop models to the Kilotest MCP server. The configuration was performed in the UI of each platform with the addition of Kilotest as a _connector_. The user used the `Customize/Connectors/Add connector/Add custom connector` interface, providing these data before activating the `Add` button:

  - Name: Kilotest
  - Remote MCP server URL: `https://kilotest.com/mcp`

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

A locally installed MCP server, `@ivotoby/openapi-mcp-server`, was used. It turned out to be incompatible with Claude Desktop, so even though connections to Kilotest were made and calls to its tools were submitted the responses did not arrive.

The model behavior motivated an architectural change in the MCP server and improvements in the naming and description of the Kilotest tools before the next increment.

#### Increment 2

Increment 2 repeated the exercise of increment 1 with the `claude.ai` web application instead of Claude Desktop, and with the improvements indicated by increment 1 made.

With Kilotest added as a custom connector, the user asked the platform, “I want to know whether the home page of the nonprofit organization named ‘Open Secrets’ has quality defects, such as with accissibility [_sic_] and usability.”

It was discovered that Claude Haiku 4.5 with Extended capability used Kilotest tools, but Claude Haiku 4.5 without Extended capability did not.

When Kilotest was used, it was used appropriately for the task, but the planning was suboptimal, because the model initially stated an intention to recommend the web page for testing instead of first checking for an existing available report on it.

The output to the user was a mixture of Kilotest results with knowledge and judgments of the model. Kilotest results were presented with some selective pruning, interpretation, and advice on what to do.

The trial in increment 2 suggested some opportunities for further improvements:

- Clearer instructions about the sequencing of tool calls
- Addition of instructions to attribute the interpretive additions by the model to the model or its other sources rather than to Kilotest.

#### Increment 3

After the above-described improvements were made, a similar exercise, with the home page of a company named “CMT Services”, was performed again in Claude Desktop. In this case Claude Haiku 4.5 succeeded in recognizing the relevance of Kilotest and used its tools, though imperfectly. Instead of using Kilotest to check for an existing report on the page, the model searched for it in a cached file with:

```bash
Bash
jq '.[] | .tested_web_page.description' /Users/pool/.claude/projects/-Users-pool-Documents/18b3821c-b60d-4f63-bf3f-542830ed3bc4/tool-results/toolu_012qMKW66d88vWjp8JKj5qNn.json 2>/dev/null | grep -i "cmt" || echo "CMT Services not found in tested pages"
```

Claude Haiku then incorrectly concluded: `CMT Services hasn't been tested yet. Let me search for their website so I can recommend it for quality testing.` The model asked the user for the URL and said:

```text
Once you provide the URL, I'll:

Recommend their home page for quality testing with Kilotest
Retrieve the quality report showing accessibility and usability defects
Provide you with a detailed analysis of any issues found
```

The user provided the URL, and Claude Haiku then submitted a recommendation to Kilotest to test the page. The submission was successful and, as expected, yielded an error message: `{"error":"A report about the page is already available"}`.

The model drew the correct conclusion from this and (contradicting itself) announced: `Great news—there's already a quality report for CMT Services! Let me retrieve it for you.` The model did so and gave the user an appropriate rendition of the results, modulo attribution. The results were introduced with `The Kilotest analysis found 51 quality defects on the CMT Services home page, affecting 163 HTML elements. Here's a breakdown:`. Some mildly interpretive additions, such as calling “high-priority” issues “critical”, were made without attribution, making it easy for a user to infer that they were made by Kilotest tools rather than the model.

The same trial was repeated, with a different website, using Claude Sonnet 4.6 with Low effort. This model immediately checked for and found an already available report and used it in the production of output to the user. The output was somewhat less interpretive than that of Claude Haiku.

Increment 3 showed that, after the naming, instructions, and connector configuration were improved, the relatively inexpensive Claude models use Kilotest where appropriate.

The misbehavior of Claude Haiku suggested that further improvements in the instructions may improve the utilization of Kilotest, namely:

- a warning not to use cached lists of available reports
- stronger advice to avoid implicitly attributing interpretations, judgments, and advice to Kilotest.

#### Increment 4

The first trial in which the user asked about a page **without** an available report repeated the conditions of Increment 3, except for the web page in question and the model. The model here was Claude Haiku in Extended mode, an option available with `claude.ai` but not Claude Desktop.

The user asked: “I want to know whether the home page of Milgard Windows and Doors, at `www.milgard.com`, has quality defects, such as with accessibility and usability.”

The model immediately:

- found Kilotest
- checked for an available report about the page
- found no report
- submitted a recommendation to test the page

The recommendation was successfully received by the Kilotest service.

During the workflow the model kept the user informed. After the last step, the model summarized the type of report that the user could expect and advised the user to check directly with the Kilotest UI at `https://kilotest.com/targets` in 24 to 48 hours for the results.

The behavior of Claude Haiku in Extended mode was nearly perfect. The naming of the page in the recommendation was “Milgard Windows and Doors home page”, whereas “Milgard Windows and Doors” would have followed the existing naming pattern. This deviation suggests adding a specific instruction to name home pages without anything more than the name of the organization.

The most notable fact was that Claude Haiku converted a long workflow to a short one by ending the output with a recommendation to the user to get the test results by self-service. The instructions to models presumed that the user and the model would jointly decide to maintain their relationship until the testing is completed and the model would then interpret the results for the user. Instead, Claude Haiku had enough imagination to suggest a viable workflow not even hinted at by the instructions.

This result suggested that the instructions should be revised to describe, as a valid option, a short workflow ending with a recommendation to the user to get the test results by self-service after the model submits a testing recommendation.

#### Increment 5

In the next increment the AI platform was changed to [Perplexity Pro](https://www.perplexity.ai/) on the web. With the platform UI, two configuration steps were taken:

1. Kilotest was added as a custom connector, and the list of connectors thereafter included Kilotest.
1. In the input section of the chat interface, with the “Add files or tools” button (visually `+`), Kilotest was added as a connector. Thereafter, a “Kilotest” button appeared in the input section to confirm the availability of that connector.

The first model used was GPT-5.4.

The prompt was: “I want to know whether the home page of the nonprofit organization named ‘Center for Democracy and Technology’ has quality defects, such as with accessibility and usability.”

GPT-5.4 responded by correctly using two Kilotest tools, first to check for an available report and then to inspect the results of the report about the specified web page. The model then appropriately itemized and summarized findings from the report, without any substantial interpretive additions.

The model was then changed to Sonar 2, created by Perplexity itself.

The results were similar, with one exception: The answer from Sonar 2 included advice and judgments (“most urgent fixes”, “especially notable”), without any attribution, so a user might wrongly infer that these were generated by Kilotest tools.

For both models, the same exercise was also attempted with the second configuration omitted, i.e. ••without** Kilotest being a named connector in the input section of the chat interface. In both cases, the models created their own unaided assessments and failed to mention or use the Kilotest tools.

The [Perplexity documentation](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors) states that as of now the installed Perplexity application for macOS does not support remote connectors.
