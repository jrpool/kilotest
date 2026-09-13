---
type: project
name: TypeScript/ESM migration plan
description: Decision to migrate Kilotest from JavaScript/CommonJS to TypeScript/ESM, with sequencing and rationale
---

# TypeScript/ESM Migration Plan

## Decision

Maintainer (age 84) has decided to migrate Kilotest to TypeScript + ESM to match QAI's architecture, aiming for a state that future maintainers can efficiently fork and continue.

## Why

- No external deadlines; learning value is desired from the exercise.
- Kilotest is a prototype with little traction, so risk of disruption is low.
- Making the codebase legible to future discoverers is the primary criterion for all decisions.

## Sequencing

1. Add `tsconfig.json` and update `package.json` scripts; rename leaf modules to `.ts` one at a time (start with `alerts`).
2. Enable `strict: true` per module, fixing errors as you go.
3. DI refactor for modules that read env vars at load time (`alerts`, `index`, `api/util`) — handle production code and tests together per module.
4. Write a static module registry to replace the dynamic `require()` in `index.js`.
5. Rename unconverted files to `.cjs`, then flip `"type": "module"` in `package.json`.
6. Convert `.cjs` files to `.ts` (ESM) one at a time.
7. Restore ESLint coverage. Add typescript-eslint and a **/*.ts config block; expect it to surface findings (the codebase leans on any in transitional code).
8. Bring test files under typecheck strict (~520 errors at last count, mostly unknown catch vars and mock shapes).
9. Narrow unnecessarily wide type annotations, including explicit `any`.
10. Rely on the `Report` interface defined at `https://github.com/YRA-Tech/testaro/blob/main/types.ts` to complete the migration of code that makes less specific assumptions about the shape of Testaro reports. This entails updating code that accesses report properties to use the expected shape.
11. Discover and utilize remaining opportunities for type enforcements, concern separations, and simplifying refactors.
12. Review all instances of exclusions from `c8` coverage reporting to ensure they are still necessary, and also decide whether to abandon `c8` in favor af the `node` built-in experimental coverage reporter.
13. Ensure that standard instances with `outcome` set to `cantTell` are consistently excluded as violations.
14. Consider whether the pattern of functions returning diverse-type values, with error conditions and normal conditions causing return values of different types, can be replaced with some other pattern, such as a return value with only the normal type and errors throwing instead, and, if so, whether that would simplify the code. But consider that some abnormal conditions are mere disqualifications (such as a report with no catalog image being disqualified from any operation that requires that image), while others are errors that should never occur (such as a report that is not valid JSON).
15. Review all work and make corrections and improvements.
16. Extract still-useful explanations from the migration plan into code-adjacent comments or terse decision documents, as appropriate, decide where the `## Later work` backlog should live once this document is gone, and then retire the migration plan (i.e. delete it, once it is obsolete).

## How to Apply

When helping with any Kilotest work, assume this migration is the active project. Prefer hand-written types over automated inference to preserve learning value. Each step should be independently mergeable with no degradation of existing behavior.

## Later work

- Add observability of request metrics.
- Investigate a dual-package hazard in the imports from `testaro-issues`. Statement by SWE-2 about this: “The dual-package hazard will bite again in the other direction once index.cjs/mcp.cjs (still CommonJS, using the .cjs build) and the converted .ts modules (using the .mjs build) hold separate copies of its state. Harmless here since testaro-issues is read-only static data, but the pattern matters if a dual-format dependency ever carries mutable state.”
- Continue web and API terminology alignment by renaming test and retest recommendations in the web UI requests, as in the API, in code comments, text outputs to users, and identifier names.

## Details

Here are proposed details for the current step.

The current step is step 12.

Step 12 has two parts.

1. **Review all `c8` exclusions for continued necessity.** There is exactly one in the codebase: the `/* c8 ignore start */` … `/* c8 ignore stop */` block wrapping the import statements at the top of `util.ts`, justified by a comment claiming c8 intermittently misreports import lines as uncovered. Verified empirically: temporarily removing the ignore block and running `npm test` reproduced the failure (two import lines reported uncovered, dropping lines/statements/branches to 99.77-99.96% and failing the 100% threshold), with the installed `c8` version against the current Node version. The exclusion is still necessary; no change to it is proposed.
2. **Decide whether to abandon `c8` for Node's built-in coverage.** Proposed decision: **keep `c8`**, for now. Reasoning:
   - Node's coverage support is invoked via `--experimental-test-coverage`, and is documented as experimental (no stability guarantee) as of the installed Node version (v26.8.2 in this environment; `package.json` requires `>=24.16.0`).
   - It does not honor `/* c8 ignore ... */` comments; it needs its own, differently-spelled syntax (`/* node:coverage ignore next [n] */`, `/* node:coverage disable */` / `enable`).
   - Whether switching would even remove the existing `util.ts` import-block exclusion is unclear (a full-suite native run reported that file at 100/100/100, suggesting it might not be needed, but an alternate invocation using `--test-coverage-include` produced inconsistent results, so this is not fully trusted).
   - More importantly, switching was tested and found to introduce a *new*, and worse-placed, need for an exclusion: `web/requestRetest/index.ts` is 100% under `c8` today, but under native coverage it reproducibly reports 90.32% lines / 66.67% branches / 50% funcs, with its success-path lines (28-30) marked uncovered, despite a passing test that exercises exactly that path. Isolating the cause: the gap appears only once a later test in the same file that uses `t.mock.module()` plus a query-string re-import (`import('./index.ts?mockNoExtracts')`) also runs; removing that later test makes the success path register as covered. This matches a known, actively-tracked family of Node core bugs where `mock.module()` combined with `--experimental-test-coverage` corrupts coverage accounting (nodejs/node#59112, #61709, #58119); five test files in this codebase use `t.mock.module`, but the gap manifested in only one of the five runs, so the failure mode is inconsistent and hard to audit for.
   - This sharpens, rather than moots, the relevance of the separate open Node core bug (nodejs/node#61586) where `node:coverage` ignore comments suppress line coverage but not branch coverage for the same lines: the exclusion the switch would actually require is not a trivial import block but a real, exercised branch (`requestRetest`'s success path), and #61586 says the standard ignore-comment workaround does not fully suppress branch coverage for exactly that kind of case. So the switch would trade one well-understood, narrowly-scoped exclusion for a new, less predictable one sitting on real logic, for which the standard workaround is documented not to work.
   - `c8` has none of these issues for this codebase's use case today and remains a stable, unmaintained-risk-free dependency choice.
   - Revisit this decision once `--experimental-test-coverage` stabilizes and the mock-module coverage-accounting bugs and the branch-coverage/ignore-comment bug are resolved upstream.

Here are step 11 work items.

- Items 1 through 10 deal with type enforcement.
- Items 11 through 15 deal with concern separation.
- Items 16 through 24 deal with simplifying refactors.

The type-enforcement items (1 through 10) are the largest cluster and align most directly with the "type enforcements" language of step 11; the concern-separation items (11 through 15) and the simplifying refactors (16 through 24) are smaller but independently mergeable, as the plan requires.

Paths below are repository-relative.

Items marked done were implemented as described; items still open say so explicitly.

1. **Use `AnnotatedAct` instead of `any` for act iteration.** (Done.) `AnnotatedAct` was exported from `util.ts`, and the existing exported `AnnotatedInstance` is the named type for `result?.standardResult?.instances` elements. Note: `Omit<Act, 'result'>` collapses `Act`'s string index signature and erases its named properties (`act.which` became `unknown`), so `AnnotatedAct` is defined as an intersection with `Act` instead.

2. **Replace `as unknown as z.infer<...>` response-content casts with typed builders.** (Done.) All eight API handlers now declare `responseContent` as `z.infer<typeof ...ResponseSchema>['response content']` and populate it without casts; `requestTest` and `requestRetest` (which used single `as` casts on `{}` placeholders) were converted the same way. Removing the casts exposed four places where the schemas disagreed with emitted output — real latent MCP output-validation failures, since the SDK validates `structuredContent` against `outputSchema` at runtime. The schemas were corrected to match actual output: `listIssues`' issues array and reporter names became nullable (`null` is emitted when report basics fail, and engine names can be `null`), `listViolators`' violator `identifier` became `string | number` (it is a `catalogIndex`), and `listDiagnoses`' diagnoses became nullable. `getReportBasics` gained overloads: with an `extract` provided it cannot fail, so it returns `ReportBasics` rather than the error union. `openapi.yaml` was regenerated, which also repaired pre-existing drift (a stale property name and a missing `disposition of your request` property).

3. **Add explicit return types to inferred utility functions.** (Done.) `getReportExtracts`, `getReportData`, `getPageData`, `getMultiReportWhats`, and `getPageDataStrings` in `util.ts`, and `processTestRequest` in `api/util.ts`, now have explicit return types.

4. **Narrow `getJSON`, `objectSort`, and `getPageDataStrings` parameters away from `any`.** (Partially done.) `objectSort`'s `sortType` is now a literal union of the supported sort modes, and `getPageDataStrings`' `pageData` uses the return type of `getPageData` (`PageData | {error: string}`). `getJSON(object: any)` still accepts `any`; making it generic (`<T>` returning a serialized `string`) is a small remaining opportunity.

5. **Narrow `getReportBasics` `extract` parameter and `checkBalancesForAlerts` `report` parameter.** (Done.) `getReportBasics`' `extract` parameter is the successful branch of `getReportExtract`'s return (`ReportExtract`, optionally with `superseded`), not the error union. `checkBalancesForAlerts`' `report` parameter is `Report` (moved to `balances.ts`).

6. **Type the `answer` registry and `apiRespond` in `index.ts`.** (Done.) `answer` is `Record<string, PageHandler>`, where `PageHandler` is `(...args: any[]) => Promise<AnswerData>` and `AnswerData` is `{status: string; message?: string; answerPage?: string}`. The registry's handler signatures genuinely differ (`(url, what, authCode)`, `(pageArgs)`, `(pathTail, search)`, `()`), so the parameter type stays broad while the return type is enforced. `apiRespond` is `Record<string, (args: string[]) => Promise<unknown>>`; `listReports` takes no arguments, so its call site passes `[]`.

7. **Narrow `getPOSTData` consumers.** (Done.) `getPOSTData` returns `Promise<unknown>` (`util.ts`), and `index.ts` no longer casts the result to `any`. Instead each POST branch casts to its own body shape (e.g., `{what?: string; url: string; why?: string}` for `requestTest.html`, `{report?: Report}` for `worker/report`, `{content?: unknown}` for `tutorialComment.html`), documenting each endpoint's expected payload. A discriminated union would not help here because the branches are selected by `pageName`, not by body content.

8. **Add null guards for `ruleEngines[engineID]` lookups.** (Done, scoped.) Lookups keyed by report content were guarded: `jobData.preventions` keys in `getReportData` and the web `listIssues` handler now fall back to the raw engine ID when metadata is missing, and `getEngineList` does likewise. Lookups keyed by `act.which` were left unguarded because `isUsableReport` validates `which` against `ruleEngines`. Enabling repo-wide `noUncheckedIndexedAccess` was tested and deferred: it produced 136 errors across 26 files, and every added guard creates a branch that the 100% c8 threshold requires a test for.

9. **Fix `isURL` return type.** (Done.) `isURL` in `util.ts` now returns `boolean`. Its test was updated: it previously asserted `instanceof URL` and `.hostname`, and now asserts `true`/`false`.

10. **Handle `null` from `getTimeString` in `getDateTimeString`.** (Done.) `getDateTimeString` now falls back to `an unknown date at an unknown time` instead of interpolating `null`; the test was updated to expect the fallback.

11. **Extract a shared "iterate test-act instances" helper.** (Done.) `getTestActs(report)` and `getTestActInstances(report, {violationsOnly?, issueID?, catalogIndex?})` in `util.ts` now centralize the traversal. All listed consumers were converted: `annotateReport` and `getReportData` in `util.ts`, `api/listIssues.ts`, `api/listViolators.ts`, `api/listDiagnoses.ts`, `web/listIssues/index.ts`, `web/listViolators/index.ts`, `web/listDiagnoses/index.ts`, `web/reannotateForm/index.ts`, and `web/listTopIssues/index.ts`. Note for step 13: the web `listViolators` and `listDiagnoses` handlers did not exclude `cantTell` instances while the parallel API handlers did; the shared helper preserves each site's original filter behavior, so that inconsistency remains to be adjudicated.

12. **Extract a shared template-population helper.** (Done.) `populateTemplate(dirName, query)` in `util.ts` replaces the boilerplate in all listed web handlers, all form handlers, and `util.ts`'s own `processTestRequest`. It uses a replacer function (`() => value`) so that `$&`, `$'`, and `` $` `` in user-provided values are not interpreted as replacement patterns. Query bags typed `Record<string, string>` were left as-is; `web/listViolators` still needs `Record<string, any>` because its query carries a `Set` and a number.

13. **Extract a shared report-deletion form handler.** (Done.) `web/reportDeletion.ts` exports `reportDeletionForm(dirName, search, spec)`, where `spec` (`DeletionSpec`) carries the form's `intro`, `emptyIntro`, `failurePrefix`, and `isDeletable` predicate. The three `index.ts` files are now thin wrappers. The shared sort uses `objectSort` twice (`timeStamp` then `url`), equivalent to the former inline comparator.

14. **Centralize recommendation deletion in `deleteRec`.** (Done.) `deleteRec(url)` in `util.ts` performs the `recsLock` read-modify-write on `recs.json`, and is used by both the `recAction.html` rejection branch in `index.ts` and `web/enqueue/index.ts` (a third `recsLock` site the original item did not list). All `recs.json` mutations now go through `updateRecs` or `deleteRec`.

15. **Move `balancePath` and `checkBalancesForAlerts` logic out of `index.ts`.** (Done.) They now live in `balances.ts`; `index.ts` calls `checkBalancesForAlerts(report)` after a report is received. `web/ai0BalanceForm/index.ts` imports the shared `balancePath` instead of computing its own. `balances.ts` was added to the c8 `include` list in `package.json` so the moved logic remains under the 100% coverage requirement.

16. **Remove the redundant `&` replacement in `getPlainText`.** (Done, corrected.) `util.ts` first replaces `&` with `+`, then replaces `[<>"'&]` with space. Only dropping `&` from the second character class is behavior-preserving; dropping the first replacement would have changed `a&b` to `a b` instead of `a+b`. The character class was fixed and the `&`-to-`+` behavior kept.

17. **Eliminate the shadowed `const [timeStamp, jobID]` in `index.ts`.** (Done.) The redundant inner declaration was removed.

18. **Remove `researchAgents` from `util.ts`.** (Done.) `researchAgents` was exported with one entry but never imported anywhere in the codebase, and is confirmed obsolete.

19. **Fix stale `.cjs` references in comments.** (Done.) `api/schemas.ts` and `api/version.ts` now reference `scripts/generate-openapi.ts`.

20. **Fix the wrong file header in `web/ai0BalanceForm/index.ts`.** (Done.) The header now describes recording the AI service 0 balance.

21. **Fix the typo "Otherwis" in `web/reannotate/index.ts`.** (Done.) Now reads "Otherwise".

22. **Fix the indentation inconsistency in `web/listReports/index.ts`.** (Done.) The extra leading space was removed.

23. **Add the missing semicolon after the `forEach` in `getReportExtracts`.** (Done.) This was a style-consistency fix, not an ASI hazard: the next statement was a comment followed by `return`, so no ASI trap existed.

24. **Decide whether `pm2.config.cjs` should remain `.cjs`.** (Done — it stays.) PM2 loads configuration files with `require()` (`Common.parseConfig` in pm2's `lib/Common.js`), which cannot load ES modules; a `.js` or `.mjs` name would fail with `ERR_REQUIRE_ESM` in this `type: module` package. An explanatory header comment was added to `pm2.config.cjs`, and `docs/SERVICE.md` was updated (it still showed `pm2.config.js` with `script: 'index.js'`).
