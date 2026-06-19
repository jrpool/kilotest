# Kilotest as an AI Tool

## Introduction

Until 2026 Kilotest was intended, and implemented, as a web application for human users.

Beginning in May 2026, it [became evident](https://github.com/jrpool/kilotest/issues/2) that Kilotest could also act as a tool for use by language models. Language models are asked for help in all domains, including the domain of software quality. When asked about the front-end quality (accessibility, usability, and standard conformity) of specific web pages, models gave answers without the use of tools, and the answers were inferior: simplistic, speculative, and fabricated. If a model were to use Kilotest as a tool, the model could give comprehensive, authoritative, grounded, and factual answers. Every reported defect could be documented and ascribed to one or more specific tools in the Kilotest ensemble.

Given the potential of Kilotest as an AI tool and the expected continued growth in the share of questions that are directed to language models, a decision was made to make Kilotest discoverable and usable as a tool for language models.

## Internal additions

The internal changes that have been made in the Kilotest codebase to support the use of Kilotest as an AI tool are:

- An API, consisting of:
  - Additions to `index.js`.
  - Addition to `util.js`.
  - Within directories providing API functionality:
    - `api.js` modules.
    - `util.js` modules, if needed, containing resources shared by the `index.js` and `api.js` modules in those directories.
- Additions to the `env.example` file.
- An `llms.txt` file and an `llms-full.txt` file, documenting the use of Kilotest by language models, conforming to the [llms-txt](https://llmstxt.org/) specification.
- An `openapi.yaml` file, documenting the Kilotest API, conforming to the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.0).
- A `sitemap.xml` file.
- A `researchAgent.js` file, testing the API.

## External actions

The external actions that have been taken to support the use of Kilotest as an AI tool are:

- A [pull request](https://github.com/public-apis/public-apis/pull/6346/changes) to add Kilotest to the list of public APIs in the `public-apis` repository.
- A [request](https://rapidapi.com/studio/api_91f2ce07-2572-48bd-a34d-ff01ed6cd039/publish/general) to add Kilotest to the Rapid API Hub.
- An [issue](https://github.com/APIs-guru/openapi-directory/issues/2677) to add Kilotest to `openapi-directory`.
- A [pull request](https://github.com/w3c/wai-evaluation-tools-list/pull/1153) to add Kilotest to the WAI evaluation tools list.
- [Configuration of Claude Desktop](https://github.com/ivo-toby/mcp-openapi-server#option-1-using-with-claude-desktop-stdio-transport) on the local development host to let Claude models find Kilotest.

## Use cases

The rationale for Kilotest as a tool for language models is set forth in the `llms-full.txt` file and is not repeated here.

Some common anticipated use cases for this role are:

- A user of a web-builder platform with responsibility for a website asks an AI platform for help in creating or improving the website.
- A prospective customer of a web development service asks an AI platform to evaluate the quality of websites in the portfolios of candidate vendors.
- A professional web developer within an organization asks an AI platform for a code review.
- A risk-management professional within an organization asks an AI platform to report on any web accessibility defects that could expose the organization to prosecution or civil litigation.
- An person who depends on web accessibility because of disabilities asks an AI platform to provide documentary support for a complaint to the owner of a website about accessibility defects.
- A disability-rights advocate or attorney concerned with inaccessibility in a particular industry asks an AI platform to perform a front-end-quality comparison of some websites in that industry.

## Strategy

### Ease of use

Any use of Kilotest as a tool of language models will fail for some of the anticipated users if they are obligated to be aware of Kilotest and to translate that awareness into instructions or documentation. Therefore, for success in all the use cases, users should be able to tell models what is wanted and rely on models to figure out whether they need tools and, if so, which ones and how to use them.

### Increments

The standardization of tool discovery and utilization by and for language models and AI platforms is partial. Major differences in protocols exist among model and platform families. Therefore, small testable increments of improvement in the tool functionality of Kilotest can best be defined by model and platform family. For example, working on discoverability first and then on usability would not be effective, because both are complex and testability would be postponed until both were complete. Instead, a coherent model and platform family should be identified and any and all improvements to make use cases successful within that family should be made and tested, before development proceeds to the next family.

One benefit of this type of incrementalism is that, after the first increment succeeds, it becomes possible to make and test external changes publicizing the fact that a particular platform-model combination delivers unprecedentedly comprehensive, truthful, and low-cost answers to questions about front-end web quality.

Another benefit is that subsequent increments can be defined incrementally rather than in advance. Lessons learned from the work on each increment can inform the choice of what to work on next.

#### Increment 1

In the first increment, the objective is to make Kilotest automatically discovered and used by Anthropic Claude models when used within the Claude Desktop application. That investigation is under way. Results will be summarized here.
