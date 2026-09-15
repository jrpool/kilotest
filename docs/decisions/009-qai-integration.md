---
date: 2026-09-14
status: accepted
---

# QAI integration

## Context and problem

The QAI application (at `https://github.com/jrpool/qai`) is a small standalone Node.js server deployed at `https://kilotest.com/qai`. QAI is a tutorial showing users how to connect AI platforms (specifically, Claude on `claude.ai`) to Kilotest's MCP server. The `kilotest` repository already provides a tutorial showing users how to use Kilotest itself. The two-repository split was required by an organizational constraint that no longer applies. QAI's own purpose (teaching users how to connect an AI platform to Kilotest) makes it naturally a part of Kilotest's tutorial content. Should QAI remain a separate deployment, or be folded into Kilotest?

## Considered options

1. **Keep separate:** QAI remains an independent repository with its own deployment, continuous integration, and process management.
2. **Merge into Kilotest:** Port QAI's tutorial content and comment-collection infrastructure into Kilotest as a second tutorial module, retire QAI as a separate deployment, and simplify the Caddyfile and process management.

## Decision

**Merge into Kilotest**, because:

- QAI is fundamentally tutorial content for Kilotest, not an independent application. Keeping it in a separate repository obscures this relationship.
- Merging eliminates duplicate infrastructure: both repositories use the same comment-storage pattern, alert environment variables, build configuration, and type-checking standards. A single repository reduces maintenance burden.
- The existing `web/tutorial/` pattern in Kilotest provides a proven, documented template for modules combining an HTML page with a comment-collection form and email alerts. QAI's infrastructure was originally designed by copying this pattern; reusing it directly instead of maintaining a reimplementation aligns the codebase with DRY principles.
- Simplifying the Caddyfile and process management reduces the risk of configuration drift, and makes the deployment easier to reason about.
- Merging improves the documentation standard. QAI includes 9 ADRs and architectural/requirements/deployment documentation that enriches Kilotest's own documentation, which initially had only 2 ADRs.

### Confirmation

To confirm that the implementation is correct:

1. All tests pass with 100% coverage, and linting and type-checking produce no errors.
2. The new QAI tutorial page and comment form are reachable and functional at their new `/tutorialAI.html` path.
3. The old QAI paths (`/qai`, `/qai/comments`) redirect correctly to the new paths.
4. Comments submitted to the new form are stored correctly and trigger email alerts as configured.

## Historical context

QAI was initially developed as an independent deployment partly because Kilotest had not yet implemented monitoring and alerting infrastructure. By the time QAI reached deployment, both QAI and Kilotest had similar comment-collection and alerting patterns. Keeping QAI separate after this convergence created unnecessary duplication. This merge resolves that architectural drift and reestablishes Kilotest as the canonical location for all Kilotest-related tutorial content.

The separate `jrpool/qai` repository is preserved as a historical archive in `jrpool`'s account and can be kept as read-only history for reference.
