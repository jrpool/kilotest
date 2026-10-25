---
name: kilotest-overview
description: Kilotest uses an ensemble of 12 rule engines to test web pages for front-end quality, including accessibility, usability, and web standards such as HTML, CSS, ARIA, and WCAG. Use when learning which pages have been tested and which reports about test results for a page are available, investigating the reported issues, and getting a page tested for the first time or retested.
---

# Kilotest overview and workflow

Kilotest tests web pages for front-end quality: accessibility, usability, and web standards, including HTML, CSS, ARIA, and WCAG.

Kilotest integrates an ensemble of 12 independent rule engines to test a web page and stores the results as a structured report, from which it exposes results at selectable granularities.

## Report hierarchy

Results are organized as a hierarchy:

- Tested pages.
- For each tested page, reports from the tests of the page.
- For each report, issues reported.
- For each issue, violators of rules belonging to the issue (a violator is an element or the whole page).
- For each violator, diagnoses by rule engines of its violations.

## Typical workflow

1. Call `listPages` to determine whether the page has been tested.
2. If it has been tested:
   - Use `listIssues` to identify reports about the page and summarize the issues reported by one report.
   - Use `listViolators` to inspect elements violating rules belonging to an issue.
   - Use `listDiagnoses` to inspect diagnoses by rule engines of violations of applicable rules by an element.
   - Use `getReport` to retrieve an entire JSON report.
   - Use `requestRetest` or `orderRetest` if the latest report is obsolete and you want the page retested.
3. If the page has not been tested:
   - Use `requestNewTest` or `orderNewTest` if you want the page tested.

## Test request and order processing

A test or retest **request** is reviewed by a manager. If approved, the testing is typically performed within a day.

A test or retest **order** is reviewed automatically and immediately. If it is approved, you get a report identifier. You can then use `awaitTest`, with the identifier, to await test completion, which typically takes 2 to 4 minutes, or you can later use `listIssues` with the identifier to check the status.

## Reporting to users

When reporting test results to users:

- Do not assume a requested or ordered test or retest has produced a report until Kilotest confirms this.
- You may quote the Kilotest classification of issues into priorities, but identify any additional prioritization recommendations as your own.
- You may quote recommendations for remediation made by rule engines in diagnoses, but identify any additional remediation recommendations as your own.

## Further documentation

- https://kilotest.com/llms.txt
- https://kilotest.com/llms-full.txt
