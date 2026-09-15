---
date: 2026-06-30
status: accepted
---

# ADR threshold

## Context and problem

Several decisions are being made early in the life of the project. What importance threshold should merit the documentation of a decision in an architectural decision record (ADR)?

## Considered options

- Lower: Create an ADR for each nontrivial decision.
- Higher: Create an ADR for each decision that is judged strategic. Deem a decision strategic if there are substantially different alternatives and the choice of an alternative is expected to have substantial effects on the maintainability or quality of the project.

## Decision

Higher, because:

- Formally documenting tactical decisions slows development with little benefit.
- Persons who want to read the ADRs for the project history can better digest the content if it remains parsimonious and strategically focused.
- Minor decisions are often understandable with inspection of the codebase.
- Decisions affecting single points in a codebase are more efficiently explained with adjacent comments that do not require navigation to a separate file.

This decision will cause the count of ADRs to be moderate, making a 3-digit naming prefix practical.

### Confirmation

To confirm that the decision is appropriately implemented, ask LLMs and human colleagues to judge whether the ADRs describe all and only the strategic decisions manifested in the codebase.

## ADR mutability convention

Unlike the strict Nygard convention of never editing an ADR once written, Kilotest maintains ADRs as kept-current documents. An ADR describes the strategic decision *as currently implemented in the codebase*, and may be edited to reflect how that decision has evolved. Historical context (for example, "approach X was tried but had defect Y, so it was replaced with Z") belongs inside the ADR when it helps prevent future maintainers from reconsidering a decision that was already evaluated and rejected. This convention allows the ADR set to remain authoritative throughout the project lifecycle without requiring separate, frozen ADRs to document every historical iteration.
