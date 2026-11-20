---
date: 2026-11-20
status: accepted
---

# Rule test coverage

## Context and problem

Analyses of rule violations across reports, such as the identification of rules that are violated by the same elements, must distinguish a rule that was passed on a page from a rule that was not tested on the page. Treating an untested rule as passed would fabricate a fact. However, Testaro reports instances of violations, not results of passed rules, so a report does not explicitly state which rules were passed.

## Decision

A rule is deemed tested on a page if and only if, in the latest report on the page:

- the report contains a test act of the rule engine of the rule,
- the report preventions (`jobData.preventions`) do not include the rule engine, and
- the `rulePreventions` property of the data of the test act of the rule engine does not include the rule. In practice, only the `testaro` rule engine reports preventions of tests of individual rules, while continuing to test its other rules.

A rule deemed tested on a page is deemed passed on the page if the report contains no instance of it.

The report extracts record the facts needed for this decision: the rule engines that tried to test (`ruleEngineIDs`), the rule engines that were prevented (`preventions`), and the rules whose individual tests were prevented (`rulePreventions`).

## Assumptions

This decision is valid only because the jobs that Kilotest creates from `job.json`:

- include all rule engines and do not select rules, although Testaro permits the selection of rule engines and rules, and
- include `"stopOnFail": false` in the `testaro` act, so the failure of one rule does not cause the remaining rules to be skipped without being recorded as prevented.

If Kilotest ever creates jobs that violate these assumptions, analyses relying on this decision must be revised to determine which rules each job tested.
