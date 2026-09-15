# QAI historical context

This document preserves pointers to documentation and development history from the `jrpool/qai` repository, which was integrated into Kilotest as part of the decision documented in [ADR 009](./009-qai-integration.md).

## QAI architectural decisions (superseded or historical)

The following ADRs from QAI are not ported to Kilotest, but their reasoning and historical context are preserved in the `jrpool/qai` repository for reference:

- **003-initial-routing.md**: QAI originally chose to deploy as an independent service on a separate port, separate from Kilotest's port 3000. This was driven by course requirements and the need for QAI to have evaluable infrastructure of its own. ADR 009 documents the superseding decision to integrate QAI into Kilotest's deployment.

- **004-prerelease-versions.md**: QAI used prerelease versioning (0.1.0, etc.) during initial development. This versioning scheme is not carried forward to the integrated Kilotest; Kilotest's own version scheme applies to all content.

- **005-infrastructure-health.md**: QAI originally required its own external monitoring with UptimeRobot because Kilotest lacked health monitoring infrastructure. This constraint is now resolved; Kilotest's unified monitoring and alerting (covered in ADR 005-observability.md) applies to both the tutorial content and any other components.

## QAI development history

Sprint reports, peer reviews, and development progress documentation are preserved in the `jrpool/qai` repository:

- `docs/progress-reports/` contains sprint reviews and reflections from the course development of QAI (sprints 3–5).
- `docs/reviews/` contains peer review feedback on QAI's initial implementation.

This historical record is retained in `jrpool/qai`'s git history and is not duplicated in Kilotest's codebase.

## Branch protection and CI configuration

QAI's GitHub branch-protection ruleset (`docs/rulesets/qai-main.json`) enforced requirements similar to those already in place for Kilotest. Kilotest's own branch protection, documented in `docs/SERVICE.md`, supersedes QAI's configuration, and the separate QAI ruleset file is not ported.

## QAI domain-specific documentation

The following documents from QAI are superseded by the integration:

- **`requirements.md`**: Documented QAI's specific functional requirements. These remain valid for the integrated tutorial, but are now framed as part of Kilotest's tutorial offerings rather than QAI-specific product requirements. Tutorial requirements are documented in the code comments and inline in `web/tutorialAI/index.ts` rather than as a separate file.

- **`architecture.md`**: Described QAI as an independent deployment. With integration, QAI's architecture is now part of Kilotest's architecture, and the former QAI-specific architectural overview is superseded by Kilotest's architecture and API design documented in the main codebase and in [ADR 001 (API design)](./001-api-design.md).

- **`deployment.md`**: Documented QAI's guest deployment on Kilotest infrastructure and its PM2 configuration. With QAI integrated into Kilotest, a single deployment configuration applies to both. PM2 and infrastructure details are now documented in `docs/SERVICE.md` with no separate QAI-specific deployment doc.

- **`repository.md`**, **`project-vision.md`**: Project-management framing specific to QAI as a university-course project. These provide historical context but are not carried forward to Kilotest's documentation.

- **`future.md`**, **`ai-implementation-review.md`**: Point-in-time project status and review artifacts. Historical context and any actionable ideas are incorporated into the main codebase and Kilotest's backlog; the original documents are not ported.

- **`manual-verification.md`**: Documented QAI's testing and deployment verification procedures. Kilotest's unified test suite and continuous-integration configuration now cover the integrated tutorial content. Some manual verification procedures from QAI (such as form submission and alerting) are mirrored in Kilotest's `smokeTest.ts` and existing test suites.
