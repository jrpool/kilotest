# Backlog

Engineering tasks and risks that are not yet scheduled.

Items marked completed or not adopted are preserved for about 2 weeks in case of production bugs.

## Protect hidden report list (completed)

### Problem

`unhideReportForm.html` currently serves the list of hidden reports, including the names of the pages they report on, in response to a plain `GET` request, with no authorization check. Only its `POST` (the unhide action itself) currently checks `authCode`. This leaks the names of hidden pages to anyone who requests the URL, which is the information this item protects; `hideReportForm.html` (which lists non-hidden reports) is not in scope.

### Adopted solution: 2 successive forms

This is a new pattern, with no precedent elsewhere in the codebase (the closest existing pattern, a single self-submitting form per manager page, is described under “Addition… addition… clear counts checkbox” above, but that pattern always leaves its `GET` publicly viewable, which is exactly what must not happen here).

- **Form 1**: a new page, `web/showHiddenReportsForm/` (`showHiddenReportsForm.html`). `GET` renders a bare form with one text input (authorization code) and a submit button, `POST`-ing to itself. It has no other content, and does not itself reveal anything about hidden reports. On a submitted `POST`, it validates the authorization code:
  - **Invalid code**: serve the error page (`status: 'error'`, message “Invalid request”, deliberately vague so as not to confirm to an attacker that the authorization code specifically was wrong), matching the now-standardized `authCode`-failure pattern used by every manager-facing form and action page in the codebase (`hideReportForm`, `unhideReportForm`, `ai0BalanceForm`, `metrics`, `pruneReportsForm`, `rewindReportsForm`, `expungeReportsForm`, `enqueue`, `reannotate`, `renewWCAG`): self-submitting forms in this codebase serve the generic error page on an invalid code, not a re-rendering of themselves with an inline error.
  - **Valid code**: respond with Form 2 (`unhideReportForm`’s rendered content: the current hidden-reports list, plus its own authorization-code input and submit button), freshly rendered.
- **Form 2**: `unhideReportForm.html`, unchanged in its own `POST` (unhide) behavior, including serving the error page on an invalid code exactly as it does today, but its `GET` route is removed entirely. It is reachable only as the response to a valid Form 1 submission, never by direct `GET`. It remains self-submitting in the existing sense: each `POST` (submitted with the authorization code and the report to unhide) re-serves the form with the updated hidden-reports list and the code input, so the manager can unhide further reports without returning to Form 1. Because a self-submitting form must accept `POST`, `unhideReportForm.html` keeps a `POST` route; only its `GET` route is removed.

Both `showHiddenReportsForm` and `unhideReportForm` are added to (or, for `unhideReportForm`, already are part of) the `managerPages` set (`index.ts`), so both are counted under `managerActivity` in the metrics table rather than `pageViews`, consistent with how every other manager route is already counted, regardless of `GET` or `POST`.

### Manage-page link

The “What can a manager do?” link on `manage.html` that currently points at the hidden-reports flow is reworded from wording that implies “declassify” to “View the list of experimental reports”, and repointed from `unhideReportForm.html` to `showHiddenReportsForm.html`.

## Expand observability (completed)

### Observability context

Kilotest currently:

- sends email alerts to a manager on certain events that are captured internally or (by UptimeRobot) externally.
- records test and retest requests, tutorial comments, and feature requests in files.
- creates log files containing significant details.
- provides public data about the tests that it has performed on web pages. That is the essential value proposition of Kilotest.

Some additional metrics would be useful for the maintainer. Currently, the maintainer has no easy method for answering questions such as:

- Is anybody using the Kilotest web UI?
- Do any AI agents use the Kilotest MCP server?
- If Kilotest is used, what classes of requests are made, with what frequencies?

Conceptually, the metrics of most potential value reveal how, how much, how often, and by how diverse a set of programmatic and web users the capabilities of Kilotest are interrogated and used, and how well or poorly the resources (memory, storage, CPU, etc.) deployed on the Kilotest server satisfy the demands placed on them. It is not obvious what those metrics should be. Whatever they are, it is also not obvious how they should be collected, recorded, and exposed.

It is not realistic to expect these questions to be answered precisely in a plan, but a plan can define a small initial observability feature set that can be implemented, experienced, and revised and expanded over time.

### Findings from investigation of current state (2026-09-19)

- **Logging**: There is no application-level logging subsystem. Kilotest writes only plain-text, one-line messages via `console.log`/`console.error`/`console.warn` (in `index.ts`, `alerts.ts`, `balances.ts`, `serve.ts`, `checkinfo.ts`, `api/util.ts`, and a few `web/*/index.ts` modules), which PM2 captures into its own stdout/stderr log files. `docs/SERVICE.md` defers rotation and retention entirely to PM2’s defaults. There is no per-request log line for ordinary traffic; the closest thing is `getAbuseError` (`index.ts`), which captures IP, method, and reason, but only for rejected or suspicious requests, and only logs it, does not persist it. “Creates log files containing significant details” (as stated above) describes PM2’s captured console output, not a bespoke logging system.
- **Alerting**: `alerts.ts`’s `sendAlert(subject, body)` and its 10 current trigger conditions are already fully documented in `docs/SERVICE.md` (“Alerting” section). No gaps found there; this observability plan does not touch alerting.
- **Request recording**: Test/retest requests (`db/jobs/testRequests.json`) and tutorial comments (`db/comments/tutorialWeb.json`, `db/comments/tutorialAI.json`) are recorded as plain JSON, keyed or listed with a `timeStamp` field but no IP, user-agent, or other client-identifying data. Feature requests (`api/requestFeature.ts`) are, despite a response message claiming they are “logged”, not persisted to any file at all; they exist only as the body of a `sendAlert` email. This is a pre-existing inconsistency, not something this plan needs to fix, but the metrics feature described below does not depend on fixing it.
- **MCP server usage**: `mcp.ts`’s `handleMCP` creates a new, stateless `McpServer` and `StreamableHTTPServerTransport` per POST request (no session ID), registers all 8 tools, and hands off to the SDK. There is no instrumentation of which tool was called, how often, or by what client. The MCP transport, being stateless, exposes no stable per-caller identifier; any usage counting can distinguish tools called from one another, but not one calling agent from another, without a new signal.
- **Web UI usage**: `index.ts` dispatches routes through a simple glob-pattern allowlist with no middleware layer; there is no existing request counter, timing, or per-route instrumentation of any kind.
- **Public reports feature** (`listReports`, `getReport`, `listIssues`, `listViolators`, `listDiagnoses`, both as MCP tools and as web/API routes): this is Kilotest’s core value proposition, serving test results publicly, and is functionally distinct from the maintainer-facing usage metrics this plan addresses. Out of scope here, except that its routes and tools are among those a usage counter would count.
- **Deployment constraints**: the production host is a 1 vCPU, 2GB RAM Vultr VM running a single PM2 instance (`max_memory_restart: 500M`), already tuned with `zram` swap because memory is tight. There is no existing metrics agent, APM, or observability dependency of any kind (`package.json` has only `@modelcontextprotocol/sdk`, `dotenv`, `testaro-issues`, and `zod` as runtime dependencies). The project is maintained by one person and enforces 100% test coverage (branches, functions, lines, statements) via `c8` on all application code. These constraints rule out any heavyweight metrics stack (Prometheus, OpenTelemetry, a queryable time-series database, etc.) as a starting point; a small initial feature set should reuse Kilotest’s existing plain-JSON-file convention rather than add a new class of dependency or infrastructure.
- **Existing smoke-test short-circuit (correction to the finding below, discovered during implementation of step 1)**: `smokeTest.ts` tags its own web and API requests with an `x-kilotest-smoke: 1` header (`sendRequest`, used for every GET/POST path in `concretePaths`). This header is already read, in `index.ts`’s `handleRequest` (around line 411), and any request carrying it receives an immediate, perfunctory `{}` response before any dispatch, route handler, or `handleMCP` call executes, application-wide, for both GET and POST, on every path including `/mcp` (tested at `index.test.ts`, “GET/POST with x-kilotest-smoke header returns a perfunctory 200”). Consequently, no smoke-test-tagged request ever reaches the web-page dispatch, `api/*` handlers, or MCP tool-call handling that this plan’s counting sites live in, regardless of whether the counting code itself checks the header. The “Excluding smoke-test traffic” decision and the data-model note below, originally written on the mistaken premise that this header was unread and that counting code needed to check it, are superseded: no exclusion logic is needed in `recordMetric`, and `sendMCPRequest` does not need the header added, since the smoke test’s own MCP probes are a deliberate, separate case that already exercises the real `handleMCP` path (the header is intentionally omitted there today, per that function’s own comment, to test unmodified request handling; adding it would defeat that purpose without helping metrics, since metrics exclusion turns out not to require it).

### Decisions

- **Internal (in-process) instrumentation, not an external/proxy-level one, and not a hybrid of both, at least for now**: an alternative was considered where some or all counting happens outside Kilotest, at the Caddy reverse-proxy layer (Caddy’s built-in `log` directive can write a structured, rotated access log per request: path, method, status, latency, remote IP, User-Agent), rather than by modifying application code. That alternative was rejected, not merely deferred, for this initial feature set:
  - It cannot answer the most important of the three questions this plan exists to answer, “what MCP tools are being used, and how often.” Kilotest funnels all 8 MCP tools through a single `POST /mcp` endpoint, with the tool name carried inside the JSON-RPC request body; a proxy operating on HTTP method and path alone cannot see it without parsing the application’s own protocol, at which point it is no longer a boundary-external solution. Since this question is the important one, a solution that cannot answer it is not viable as the sole mechanism, so internal instrumentation is necessary regardless of what else is decided.
  - Given that internal instrumentation is therefore required for MCP tool counting, a further, separate question is whether an external layer should be added on top of it, to count web-page views and API operations instead of (or in addition to) doing so internally. Decided against, for now: a dual internal-plus-external solution is more complex to build, reason about, and maintain than a single internal one, and it would require writing and maintaining configuration at the host/Caddy level (tracked only as a documentation copy in `docs/SERVICE.md`, not exercised by any test or CI check), rather than in version-controlled, type-checked, unit-tested application code.
  - An external solution’s main distinguishing benefit is visibility into requester-identifying detail (remote IP, User-Agent, and similar client facts) that internal code does not currently capture. That detail is not currently useful to the maintainer, and capturing it would sit in tension with Kilotest’s current privacy posture of not tracking who is using the service or making requests. If that posture changes later (for example, if user accounts are introduced), requester identity would become directly available inside the application anyway, which removes the main motivating reason to add an external layer at all. This can be revisited if and when that changes.
  - Conclusion: build one internal mechanism, applied uniformly (see the next decision), and treat resource-level and requester-identity observability, the areas where an external or host-level layer would have concrete advantages, as explicitly out of scope for this iteration (see Explicitly deferred, below), not as a gap this plan tries to partially fill with a second mechanism.
- **One shared utility function, called at every counted site, not ad hoc calls per call site**: once metrics recording is being added to the codebase at all, every location that needs to record an event calls the same utility function, rather than each of the three call sites (web-page dispatch, MCP tool dispatch, API dispatch) growing its own inline increment logic. This keeps the increment logic and any future change to what gets recorded in one place, so a successor maintainer only needs to understand one function to understand how metrics recording works everywhere it is used, rather than auditing each call site separately for consistency. (The function does not need to implement smoke-test exclusion; see the correction above, smoke-test traffic never reaches any counted call site in the first place.)
- **Storage**: a single new file, `db/metrics.json`, following the same plain-JSON-file convention as `testRequests.json` and the comments files. It holds simple counters (see Data model below), read into memory, incremented, and written back to disk synchronously on each `recordMetric` call, matching the existing write-on-every-mutation pattern used by `deleteTestRequests` for `testRequests.json`, rather than an interval-based buffering scheme (which has no precedent in this codebase and would need its own flush-timing and shutdown-handling logic, neither of which any existing Kilotest code implements). This is acceptable because metrics writes are small, infrequent relative to a typical request’s own I/O, and not on any latency-sensitive path. This avoids both the unbounded growth of an append-only per-event log (which would need its own retention policy from day one) and the data loss that a purely in-memory counter would suffer on every PM2 restart or deploy.
- **Access**: a new page, `/metrics.html`, built as a `web/metrics/` module following the established one-topic-per-directory convention (`answer()` exported, rendered via the existing `populateTemplate` helper), displaying the counts in a simple HTML table, with no new delivery mechanism (email digesting via `alerts.ts` was considered and deferred; it can be layered on later, reusing the same `db/metrics.json` data, if the maintainer finds a page alone insufficient). It is gated by the existing `authCode === process.env.AUTH_CODE` convention already used by the codebase’s other manager-power pages (`web/reannotate/`, `web/hideReportForm/`, `web/unhideReportForm/`, `web/enqueue/`), so it lives among the “what can a manager do?” capabilities rather than being publicly viewable, at least initially. Metrics data is not treated as more sensitive than the data already exposed behind (or, for a page like `hideReportForm.html`, partly without) this same check, such as which reports are hidden or which rules are unclassified; the gate reflects that this starts as a manager power and may later be made public, not a claim of special sensitivity. Should the maintainer later decide to expose it publicly, that is a one-line change (dropping the `authCode` check from `web/metrics/index.ts`), not a rearchitecture, since the counters and their storage are unrelated to who is allowed to view them.

### Data model (initial)

`db/metrics.json` holds, at minimum:

- **Web UI page views**: a count per page name (the same page names already used as dispatch keys in `index.ts`’s `answer{}` table), incremented once per successful GET of a `.html` page.
- **MCP tool calls**: a count per tool name (the 8 names already registered in `mcp.ts`), incremented once per successful tool invocation.
- **API operation calls**: a count per operation, for the `api/*.ts` handlers reached outside the MCP transport, since those are a third, distinct traffic class alongside web-UI and MCP usage.
- **A `since` timestamp**: when the current counting period began, so the maintainer can interpret the counts as “since this date” rather than assuming they cover all of Kilotest’s history; reset only if the file is intentionally cleared.

Smoke-test traffic never reaches any counted call site (see the corrected finding above), so no separate exclusion logic is needed for the numbers to reflect real usage only, not CI-driven smoke-test traffic against the live service.

This does not attempt to capture request-level detail (no per-event timestamps, no IP, no user-agent), a deliberate scope limit: it answers “is this used, how much, and what kinds of requests” at the frequency level asked for in the backlog item, not “by whom” (MCP’s stateless transport has no stable caller identity to record) or “when, precisely” (an append-only event log with its own retention story is a natural second iteration if the maintainer finds category counts insufficient once seen).

Resource metrics (memory, storage, CPU) are explicitly deferred to a later iteration: PM2 and the host OS already expose these (`pm2 monit`, `free`, `df`), so an initial feature set should first confirm the usage-frequency counters are worth having before building a second, separate mechanism for resource metrics.

### Observability implementation steps

The steps below are sequential and, except for step 7, interdependent: for example, after step 1 alone `recordMetric` exists but no call site uses it yet, which the 100%-coverage requirement would fail, and after step 3 alone `web/metrics/` exists but is not reachable through `index.ts`’s dispatch, so nothing exercises it. Only step 7 (documentation) is a true no-op on functionality and could land as its own trailing commit without affecting `npm test`. Commit and push freely at intermediate points on the `observability` branch as work progresses, to avoid losing work, but only open the pull request to `main` once every step is complete and the full check suite (100% coverage, typecheck, lint, tests) passes, per Kilotest’s branch-protection rules (`docs/SERVICE.md`, “Branch protection”).

1. Add a small counters module (e.g. functions in `util.ts` or a new `metrics.ts`) that loads `db/metrics.json` at startup (creating it with zeroed counts if absent, following the `getTestRequests`-style ENOENT-creates-default pattern), and exposes one shared utility function, e.g. `recordMetric(category, name)`, that increments `category.name` and writes the file. No smoke-test check is needed here (see the corrected finding above).
2. Call `recordMetric` from the three call sites identified above: the generic `.html` GET dispatch in `index.ts` (page views), `mcp.ts`’s tool-call handling (one call per tool, at the point each tool’s handler is invoked), and the `api/*.ts` dispatch (operation calls). Each site passes its own category and name but otherwise calls the same function the same way; no call site implements its own increment logic.
3. Add `web/metrics/` (`index.ts` exporting `answer()`, `index.html`) rendering the current counts and `since` timestamp as an HTML table, following `web/listTopIssues/`’s pattern for an aggregate-data page, gated by the same `authCode === process.env.AUTH_CODE` check used in `web/reannotateForm/` and `web/reannotate/` (a query-string `authCode` param on the GET request, checked before returning the populated page rather than an error).
4. Wire `metrics.html` into `index.ts`’s `answer{}` table and `routes.GET`, and add the path to the Caddyfile allowlist (repository copy and `docs/SERVICE.md`’s copy) and to `smokeTest.ts`’s `concretePaths.GET`, per the existing “add a new route” checklist in `docs/SERVICE.md`. No special handling is needed for the smoke test’s own visit to `/metrics.html`: like every other page, it is intercepted by the existing `x-kilotest-smoke` short-circuit in `handleRequest` before `answer.metrics` (and therefore `recordMetric`) ever runs.
5. Implement the `authCode` gate in `web/metrics/index.ts` per the Access decision above: return `{status: 'error', message: 'Invalid authorization code'}` when the submitted `authCode` query-string parameter does not equal `process.env.AUTH_CODE`, matching the existing pattern in `web/reannotateForm/index.ts`. Note the gate’s location (one check, in one file) for a future change to make the page public, so that revisiting this decision later is a small, easily found edit.
6. Tests: unit-test `recordMetric` directly (increment, load-on-missing-file) and separately confirm each of the three call sites actually calls it (so a future refactor that bypasses the shared function is caught), plus test `web/metrics/`’s `answer()` (both the authCode gate and the rendered table), and extend `index.test.ts` to cover the new route, maintaining the required 100% coverage.
7. Document the new page and its data model briefly in `docs/SERVICE.md`, alongside the existing “Alerting” and “Health monitoring” sections, so this becomes part of the same operational-documentation set.

### Observability verification

- `npm run typecheck`, `npm run lint`, and `npm test` pass with 100% coverage maintained.
- Locally, exercise a few web pages, MCP tool calls, and API operations, then load `/metrics.html` and confirm the counts increment as expected and persist across a process restart (i.e., the write-on-every-call and load-on-startup behavior both work).
- `node smokeTest.ts` confirms `/metrics.html` is both allowlisted and reachable, and, run against a local instance, confirms the counts in `db/metrics.json` do not change as a result of the smoke test’s own requests (web, API, and MCP), since all of them are intercepted by the existing `x-kilotest-smoke` short-circuit before reaching any counted call site.

### Explicitly deferred (candidates for a future, revised iteration once this is experienced in practice)

- Resource metrics (memory, storage, CPU headroom on the host).
- Per-event time-series data (e.g., usage trends over time, not just cumulative counts since a reset).
- Any notion of caller/client identity for MCP usage (would require a new signal, since the current transport is stateless and session-less).
- A periodic email digest of the metrics, reusing `alerts.ts`, if a page alone proves insufficient for the maintainer’s workflow.

### Revision: separate manager-page activity from real usage (2026-09-19, after initial deployment)

After the initial 7 steps were deployed, the maintainer observed a concrete problem while manually testing the feature in a browser: the maintainer’s own clicks (visiting `/manage.html`, then `/metrics.html`) were themselves being counted as `pageViews`, indistinguishable from real usage. The `x-kilotest-smoke` exclusion (see the corrected finding above) only ever excluded automated smoke-test traffic, not a human maintainer manually operating the browser, so this is a real, separate gap the initial plan did not address.

**Considered and rejected: a cookie set on successful `authCode` verification.** The idea was that submitting a valid `authCode` anywhere already proves the requester is the maintainer, so that moment could set a long-lived cookie, and `recordMetric`’s call sites could check for it and skip counting. This was rejected, not merely deferred, for a structural reason surfaced during design: the very first request of any testing session necessarily happens *before* the cookie exists (a cookie cannot be set retroactively on the request that earns it), so at least one page-view per session would always leak into the counts regardless of where the cookie-setting logic lived. Retroactive correction (decrementing the bootstrap hit once the cookie is issued) was considered and rejected as disproportionate complexity (tracking session state before identity is proven) for a small, shrinking rounding error. A cookie would also have raised a second question, whether it should also suppress the `authCode` prompt on future manager-page visits (a lightweight session-authentication feature): that broader feature was explicitly declined as out of scope for this fix, since it touches every `authCode` check site in the codebase and deserves its own design, not one riding in on a metrics correction.

**Adopted instead: exclude manager pages from `pageViews` by identity, not by session state.** The insight is that manager pages are not the traffic the backlog item’s three questions (is anybody using the web UI, do AI agents use MCP, what request classes occur) are actually about; they are the maintainer operating Kilotest, structurally analogous to how MCP tool calls are agent-driven and web pages are (assumed) human-driven. Excluding them by page name, a static, known set, sidesteps the cookie/session/bootstrap problem entirely: there is no “first request before identity is proven” concept when the exclusion is by identity of the *page*, not identity of the *requester*. The maintainer can also now navigate directly to `/metrics.html?authCode=...` (bookmarked or typed) to authenticate before doing any other browsing, avoiding even the `/manage.html` hit, though this is a workflow suggestion, not a requirement the mechanism depends on.

**The excluded set**: every page linked from `/manage.html` (`enqueueForm.html`, `reannotateForm.html`, `pruneReportsForm.html`, `rewindReportsForm.html`, `expungeReportsForm.html`, `hideReportForm.html`, `unhideReportForm.html`, `ai0BalanceForm.html`, `renewWCAGForm.html`, `metrics.html`), plus the POST-only action pages some of them submit to (`requestAction.html`, which performs the `enqueue` action; `reannotate.html`; `renewWCAG.html`). The self-submitting Form pages (`pruneReportsForm.html` and similarly-shaped others) have only one page for both viewing and acting, so they need no separate action-page entry. `manage.html` itself is also excluded, since it is purely a manager-facing directory of these other pages.

**New data model: a `managerActivity` category, tracking success and failure separately.** A single combined count per manager page (matching how `pageViews`/`apiOperations` work today) was considered and rejected: the actual value of a separate table, once manager pages are pulled out of the main counts anyway, is to make repeated *failed* `authCode` attempts visible as a signal of suspected abuse, distinct from the maintainer’s own successful use. A combined count would hide exactly that signal. `db/metrics.json`’s `managerActivity` category is therefore `Record<string, {ok: number; error: number}>`, keyed by page name, incremented on the outcome actually returned by that page’s `answer()` call (or, for the three POST action pages, by the same success/failure branching `index.ts` already uses to choose between serving the answer page and calling `serveError`).

**New instrumentation required, not just re-categorization.** Because `requestAction.html`, `reannotate.html`, and `renewWCAG.html` are POST-only and were never wired to `recordMetric` in the original 7 steps (step 2 only instrumented the generic `.html` **GET** dispatch, `mcp.ts`’s tool handlers, and `/api/*`), adding them to `managerActivity` is new instrumentation, not a relabeling of existing counts. This was weighed against deferring the three POST action pages and only re-categorizing the already-tracked GET Form pages; instrumenting all of them was chosen for completeness, since an incomplete manager-activity table (views but not the actual submissions and their outcomes) would defeat much of the point of a suspected-abuse signal.

#### Revised implementation steps

1. In `util.ts`, extend the `Metrics` type with `managerActivity: Record<string, {ok: number; error: number}>`, initialized empty alongside the other categories in `getMetrics`’s ENOENT branch. Extend `recordMetric`’s `category` parameter type to include `'managerActivity'`, and give it a way to record an outcome for that category (for example, an optional third `outcome: 'ok' | 'error'` parameter, used only by `managerActivity` calls, defaulting to incrementing a plain count for the other two categories as today).
2. Define the manager-page name set (the list above) once, in one place (for example an exported `const managerPages` in `util.ts` or `index.ts`), so it is not duplicated across call sites and stays easy to extend if `manage.html` grows new links.
3. In `index.ts`’s generic `.html` GET dispatch (where `recordMetric('pageViews', topic)` was added in the original step 2), branch on membership in the manager-page set: if `topic` is a manager page, call `recordMetric('managerActivity', topic, 'ok')` instead of recording a `pageViews` hit (the GET dispatch only reaches this call on `answerData.status === 'ok'`, so only the success side applies here; a manager Form page’s own internal validation errors, such as `hideReportForm.html`’s “Invalid authorization code”, already route through the existing `status: 'error'` branch and `serveError`, which is the natural place to add the `error`-outcome call for self-submitting Form pages).
4. Add `recordMetric('managerActivity', 'requestAction.html', outcome)`, `recordMetric('managerActivity', 'reannotate.html', outcome)`, and `recordMetric('managerActivity', 'renewWCAG.html', outcome)` calls to their respective POST branches in `index.ts`, on both the success path (matching `answerData.status === 'ok'`) and the failure path (the invalid-request / `serveError` branch), so both outcomes are captured for these three previously-uncounted pages.
5. Update `web/metrics/index.ts` to render a fourth table, “Manager page activity”, with columns for page name, successful count, and failed count, sourced from `metrics.managerActivity`. Keep the existing `pageViews`, `mcpToolCalls`, and `apiOperations` tables as they are, now containing only non-manager traffic as a side effect of step 3.
6. Update tests: `util.test.ts` for the extended `recordMetric` signature and `managerActivity` counting; `index.test.ts` to confirm a manager page (for example `hideReportForm.html`) increments `managerActivity` rather than `pageViews`, and that both outcomes are recorded for at least one POST action page (for example `renewWCAG.html`, both a valid- and an invalid-`authCode` submission); `web/metrics/metrics.test.ts` for the new table’s rendering.
7. Document the `managerActivity` category and the manager-page exclusion rationale in `docs/SERVICE.md`’s “Usage metrics” section, alongside the existing description of `pageViews`, `mcpToolCalls`, and `apiOperations`.

#### Explicitly deferred (from this revision)

- Any cookie- or session-based mechanism (rejected above, not merely deferred, given the structural bootstrap problem and the separate, larger session-authentication question it would raise).
- Alerting on `managerActivity` failure spikes (for example via `sendAlert`, matching how other suspected-abuse-adjacent conditions already alert): worth considering once the table has been observed in practice, but not needed for this initial correction.

### Correction: the manager-page split did not solve the maintainer’s actual problem (2026-09-19, same day)

After the revision above was deployed, the maintainer identified that it missed the mission: the maintainer tests *all* URLs manually in a browser, not only manager-specific ones, so ordinary page views (`tutorialWeb.html`, `listReports.html`, and so on) were still being counted as real usage during manual testing sessions, exactly the original complaint. The manager-page/`managerActivity` split is still worth keeping, since it usefully separates a distinct traffic class and surfaces a suspected-abuse signal (failed `authCode` attempts), but it was never a substitute for excluding the maintainer’s own browsing generally, and this revision’s prior write-up incorrectly treated it as though it were. The cookie-based approach, rejected above for the narrower “does this fully solve the metrics-page bootstrap problem” question, is reconsidered here for the broader, actual goal.

**Revisiting the cookie’s bootstrap gap**: the earlier rejection reasoned that a cookie can never exclude the very request that earns it, so it can never be a *complete* solution to unwanted counting from the metrics page specifically. That reasoning still holds, but it was answering the wrong question: a mechanism that excludes an entire subsequent testing session, at the cost of one first request still being counted, is a large improvement over excluding nothing, which is what the manager-page split alone achieves for ordinary pages. The bootstrap gap is accepted as a small, known, one-time-per-session cost, as originally proposed, and no longer treated as disqualifying.

**Mechanism**: submitting a valid `authCode` on `/metrics.html` sets a cookie whose value is a SHA-256 hash of `process.env.AUTH_CODE` (via Node’s built-in `crypto`, no new dependency), not the raw code itself, so the secret is never placed in a long-lived browser cookie. `recordMetric`’s `pageViews` and `apiOperations` call sites in `index.ts` (both already have the request in scope) recompute the same hash and skip recording when the request’s cookie matches. MCP tool calls are not covered (`mcp.ts`’s handlers do not currently receive the raw request, and a maintainer manually driving MCP tools via a browser is a rare case not worth the signature changes this would require); this is an explicit, narrower scope than full coverage, left for a future iteration if it proves worth doing.

**Why a hash, not a fixed cookie value or the raw `authCode`**: Kilotest’s source is public. A fixed, guessable cookie value (for example a literal `excluded=1`) would let any visitor read the source, set that cookie in their own browser, and exclude themselves from metrics with no effort and no knowledge of `AUTH_CODE`, defeating the feature’s purpose of producing trustworthy counts. Hashing `AUTH_CODE` ensures only someone who has already proven they know the real code (by submitting it correctly) can derive the cookie value, while never exposing the code itself in a cookie a browser (or anyone with access to that browser) could read back out.

**New mechanism needed for `web/metrics/index.ts` to ask `index.ts` to set a cookie**: `answer()` functions return data; they do not touch the `IncomingMessage`/`ServerResponse` objects directly, and `index.ts` alone decides how to translate an `AnswerData` result into an actual HTTP response. To preserve that separation, `AnswerData` gains an optional `setCookie?: {name: string; value: string; maxAgeSeconds: number}` field, which `index.ts`’s `.html` GET dispatch applies via `response.setHeader('Set-Cookie', ...)` when present, right alongside where it already serves `answerData.answerPage`. This is a small, generic extension, not metrics-specific, reusable by any future page that needs to set a cookie.

**Cookie lifetime**: 30 days (`Max-Age=2592000`), long enough that the maintainer rarely needs to resubmit `authCode` across sporadic testing sessions spread over weeks, while still naturally expiring rather than being effectively permanent.

**Two further, separate gaps identified during this correction, both to be fixed alongside the cookie work**:

- A `metrics` row currently appears in both the `pageViews` table and the `managerActivity` table on a server that had previously counted `/metrics.html` under `pageViews` (before the manager-page-split revision existed) and has since accumulated new `managerActivity` counts for the same page. This is stale historical data, not a live code defect: `pageViews.metrics` will not grow further, since `/metrics.html` is now always excluded from it. No code change is needed; the maintainer can manually clear the stale `pageViews.metrics` entry from `db/metrics.json` if the split view is wanted immediately, or let it remain as a historical artifact from before the split.
- Visits to the home page (`/` and `/index.html`) are not recorded at all, in any category. This is a genuine gap distinct from the manager-page and cookie issues: the home page is served by a separate, raw static-file branch in `index.ts` (`pathname === '/' || pathname === '/index.html'`) that predates, and is not reached by, the generic `.html` GET dispatch where `recordMetric('pageViews', topic)` lives. Since the home page is plausibly the single most important page for answering “is anybody using the Kilotest web UI?”, this branch needs its own `recordMetric('pageViews', 'index')` call, consistent with the cookie-exclusion check applying there too.

#### Corrected implementation steps

1. Add a `getExclusionCookieValue()` helper (in `util.ts`) that computes `crypto.createHash('sha256').update(process.env.AUTH_CODE ?? '').digest('hex')`, used both to set and to verify the cookie, so the two sides can never drift out of sync with each other.
2. Extend the shared `AnswerData` type (`index.ts`) with an optional `setCookie?: {name: string; value: string; maxAgeSeconds: number}` field. In the `.html` GET dispatch, when `answerData.setCookie` is present, call `response.setHeader('Set-Cookie', ...)` (name, value, `Max-Age`, `Path=/`, `HttpOnly`, `SameSite=Strict`) before serving the answer page.
3. In `web/metrics/index.ts`, on a successful `authCode` check, include `setCookie: {name: 'kilotestExclude', value: getExclusionCookieValue(), maxAgeSeconds: 2592000}` in the returned `AnswerData`.
4. Add a small helper (`index.ts` or `util.ts`) that reads `request.headers.cookie`, parses it minimally (no new dependency), and returns whether the exclusion cookie is present with the expected value.
5. In the `.html` GET dispatch’s success branch, skip the `recordMetric('pageViews', topic)` call (but still serve the page normally) when the exclusion check passes; manager-page (`managerActivity`) recording is unaffected, since it exists for a different purpose (a suspected-abuse signal) and should continue regardless of the maintainer’s own cookie.
6. Apply the same exclusion check to the `/api/*` GET and POST branches’ `recordMetric('apiOperations', ...)` calls.
7. Add `recordMetric('pageViews', 'index')` (with the same exclusion check) to the home-page branch (`pathname === '/' || pathname === '/index.html'`) in `index.ts`, closing the separate home-page gap identified above.
8. Tests: unit-test `getExclusionCookieValue` (deterministic for a given `AUTH_CODE`, changes if `AUTH_CODE` changes); test that submitting a valid `authCode` on `/metrics.html` returns a `Set-Cookie` header with the expected attributes; test that a subsequent request carrying that cookie does not increment `pageViews` or `apiOperations` for an ordinary page, while a request without it does; test that the home page now increments `pageViews.index`.
9. Document the cookie mechanism, its 30-day lifetime, and the home-page fix in `docs/SERVICE.md`’s “Usage metrics” section.

#### Explicitly out of scope (from this correction)

- MCP tool-call exclusion via the cookie (would require threading the request/cookie header into `mcp.ts`’s handlers; deferred as a separable, lower-priority change).
- Automatically migrating or clearing the stale `pageViews.metrics` entry described above; left as a manual, one-time cleanup for the maintainer if wanted.

### Addition: a “clear counts” checkbox on `/metrics.html`, and a related bug fix affecting 6 pages (2026-09-20)

The maintainer asked for a checkbox on `/metrics.html`, labeled “Clear counts”, making the page dual-use: viewing the metrics, or clearing them and then viewing the (now empty) result as confirmation. Checking it resets all four categories (`pageViews`, `mcpToolCalls`, `apiOperations`, `managerActivity`) and `since` (to the moment of clearing), a full reset chosen over leaving `managerActivity` untouched, since clearing usage counts and reviewing a suspected-abuse log were judged to be one action, not two, for this feature.

**A pre-existing, unrelated bug surfaced while designing this**: `web/metrics/index.ts`’s new form (like several other manager pages) defaulted to a GET submission, and while checking that choice against the codebase’s convention, the maintainer confirmed the actual intent has always been that all form submissions are `POST` requests, matching `web/enqueueForm/index.html`, `web/reannotateForm/`, `web/renewWCAGForm/index.html`, and `web/requestTestForm/index.html`, which already do this correctly. Five existing pages had omitted `method="post"` and were submitting via GET instead: `ai0BalanceForm.html`, `expungeReportsForm.html`, `hideReportForm.html`, `pruneReportsForm.html`, and `rewindReportsForm.html`. This is fixed alongside the new `metrics.html` form, rather than adding a sixth instance of the same bug.

**Architecture chosen for the fix**: unlike `enqueueForm.html`/`reannotateForm.html`, whose submissions POST to a separate, differently-named action page (`requestAction.html`, `reannotate.html`), all 6 affected pages self-submit to their own exact page name (for example `hideReportForm.html` posts to `/hideReportForm.html`). Splitting them into Form/Action page pairs, to match the other split, was considered and rejected as unnecessarily large: it would introduce 6 new page names and routes where none are needed. Instead, each page keeps its single URL and single `answer(pathTail, search)` function; `index.ts` gains a new POST dispatch branch, shared by all 6 (`selfSubmittingManagerPages`, a subset of the existing `managerPages` set), that reconstructs a query-string-shaped value from the POST body via `new URLSearchParams(postData).toString()` and calls the same `answer[topic]` function GET already calls, so each page’s internal parameter-reading code needs no change for this part of the fix.

**A second bug found by manual testing, not caught by any test**: after wiring the new POST branch, `GET /metrics.html?authCode=...&clearCounts=on` still cleared the counts, because adding a POST path never removed the pre-existing GET path’s ability to process the exact same query-string parameters; the two paths simply both worked. Discovered by hand (`curl`), not by the test suite, since every added test happened to test either GET-with-no-params or POST-with-params, never GET-with-params. This is the actual crux of “make all submissions POST”: the point is not merely that a POST option exists, but that GET must no longer be able to submit at all.

**Fix considered and rejected**: stripping the query string before calling `answer[topic]` on GET (in `index.ts`, one line, for pages in `selfSubmittingManagerPages`), leaving all 6 pages’ own code untouched. Rejected because it fixes the symptom via an implicit invariant a future maintainer editing one of these pages would have no way to discover: the function still contains a working “if this param is present, process the submission” branch, and nothing in it says that branch is unreachable via GET. A future refactor of `index.ts`’s dispatch that reintroduces query-string forwarding, for an unrelated reason, would silently reopen the exact same hole, with no test protecting against it beyond luck.

**Fix adopted**: each of the 6 `answer()` functions gains an explicit method parameter (`answer(pathTail, search, method)`), and their existing “if the action parameter is present” checks become “if `method === 'POST'`”, so a GET request can never trigger the action regardless of what is in its query string, and the rule is a visible condition in the code itself rather than a property of what the caller happens to pass in. `index.ts` passes `'GET'` or `'POST'` at each of the two call sites (the generic `.html` GET dispatch, and the new self-submitting-pages POST branch).

#### Implementation steps for this addition

1. Add `clearMetrics()` to `util.ts`: resets all four categories to empty and `since` to `getNowStamp()`, using the same `metricsLock`, returning the fresh `Metrics` object so the caller can render it without a second read.
2. In `web/metrics/index.ts`: read a new `clearCounts` checkbox param; if present (and `authCode` valid), call `clearMetrics()` instead of `getMetrics()`, and prepend a “Counts cleared.” confirmation line to the rendered body. Add the checkbox to the initial (no-`authCode`-yet) form.
3. Fix the method-omission bug: add `method="post"` to the 5 pre-existing forms’ HTML (`ai0BalanceForm`, `expungeReportsForm`, `hideReportForm`, `pruneReportsForm`, `rewindReportsForm`) and to the new `metrics.html` form.
4. In `index.ts`: add a `selfSubmittingManagerPages` set (the 6 page topics above); add the 6 pages’ exact paths to `routes.POST`; add a new POST-dispatch branch, shared by all 6, calling `answer[topic](pathTail, search, 'POST')` with a reconstructed `search` from the POST body, recording `managerActivity` on both outcomes; widen the existing `.html` GET dispatch’s POST-exclusion guard (`!isPathAllowed('POST', pathname)`) so pages in `selfSubmittingManagerPages` are not excluded from the GET path just because they are now also POST-allowed.
5. Give each of the 6 `answer()` functions a third `method` parameter, and change their internal “action parameter present” checks to “`method === 'POST'`”, so GET can never trigger the action; update `index.ts`’s two call sites (GET dispatch, new POST branch) to pass the method.
6. Update the Caddyfile (repository doc copy in `docs/SERVICE.md`, and the real server copy) and `smokeTest.ts`’s `concretePaths.POST`/`postBodies` to add the 6 new POST paths, per the existing “add a new route” checklist.
7. Tests: add POST-path integration tests for all 6 pages (at least one success and one authCode-failure case each) in `index.test.ts`; add a regression test confirming a GET request carrying the same params a POST would use does **not** trigger the action (the exact bug found by manual testing); add `web/metrics/metrics.test.ts` coverage for the checkbox’s presence, the clear behavior, and the confirmation message; each of the 6 pages’ own unit test files need no change, since their exported `answer()` behavior for a given `method` argument is what is now tested, not a new behavior.
8. Document the `method="post"` fix and the clear-counts checkbox in `docs/SERVICE.md`’s “Usage metrics” section.

## Improve MCP-zero discoverability (not adopted)

The MCP-Zero protocol for tool discovery and selection has not yet been widely adopted but appears to have gained substantial traction. The following review (by Gemini) asserts that Kilotest is not as well prepared to be discovered and used by MCP-Zero agents as it could be.

Get a second opinion on the following review. Is it prudent for Kilotest to make itself more MCP-Zero-friendly? If so, is the expansion of identifiers from short IDs to descriptions-as-names a necessary part of that improvement? If it is, can the identifier expansion be limited to the externally visible interface, so that it does not creep into the internal implementation? If the proposed revision is prudent, plan it.

### Second opinion (obtained 2026-09-19, not adopted)

The review does not hold up under verification against the actual codebase and against MCP-Zero itself, so its proposal was not adopted.

- **The review’s “before” code quotes are fabricated.** It presents `listReports` as having the description “Lists all reports.”, but no such string exists anywhere in the repo; the real tool (`mcp.ts`, lines 56 to 58) already has a substantive description (“Provide basics about all available reports.”) plus annotations such as `title` and `readOnlyHint`. Its “optimized” replacement tool, `kilotest_list_web_quality_reports` with a `url_filter`/`limit` schema, corresponds to no real tool: `listReports` takes no input at all, and the review’s own footnote admits that schema “does not yet exist”. The proposed `kilotest_run_ensemble_audit` also matches no real tool. These are invented strawmen, not an accurate before/after of Kilotest’s code.
- **The review misrepresents what MCP-Zero is.** MCP-Zero (arXiv 2506.01056) is a single 2025 research paper, not an adopted protocol, and there is no evidence of the “substantial traction” the review claims. It describes a client-side technique: the agent generates a request, and a routing layer embeds it against whatever names, descriptions, and schemas a server already exposes. Nothing in the paper asks server authors to add a manifest file, adopt name prefixes, or restructure schemas. `mcp-manifest.json` is a real but unrelated third-party convention (mcp-manifest.dev) that the review conflates with MCP-Zero to manufacture a concrete-sounding deliverable.
- **One claim does check out.** Kilotest is genuinely registered on Smithery and Glama (`README.md`, lines 60 to 61; `docs/AI-TOOLS.md`, lines 46 to 47), so that part of the review is accurate, though it is not evidence for the MCP-Zero framing built around it.

**Conclusion:** it is not prudent to restructure Kilotest’s MCP tools on the basis of this review, since there is no verified mechanism by which the proposed changes would improve discoverability under MCP-Zero specifically. The identifier-expansion question (and whether it could be confined to the externally visible interface without creeping into the internal implementation) is therefore moot; it was not reached. Any future, independently justified improvements to tool naming, descriptions, or package metadata should be evaluated on their own merits (for example, human and LLM legibility in MCP clients generally), not as compliance with a research paper that does not impose such requirements.

### Introduction

To make your **kilotest** MCP server discoverable by **MCP-Zero** agent loops (or enterprise gateways using active tool discovery architectures), you need to optimize how your server represents itself to semantic routers.

Because MCP-Zero operates as a **two-stage semantic routing system** (first matching the server domain, then matching the specific tools via vector embeddings), a standard MCP list_tools setup is not enough. You must optimize your metadata and schemas so that indexers can crawl and agents can query your server dynamically on demand.

Follow these steps to make your server fully discoverable:

### **1. Re-Architect Your Tool Naming & Descriptions**

MCP-Zero relies heavily on the LLM’s ability to articulate an *Active Tool Request* based on semantic gaps. Ambiguous tool names like `listReports` are the primary reason a server gets passed over during a vector lookup.

Change your tool declarations to be unambiguous and explicitly tied to your domain (ensemble front-end quality and accessibility testing):

*`// ❌ Old Anti-Pattern for MCP-Zero`*
`{`
  `name: "listReports",`
  `description: "Lists all reports."`
`}`

*`// ✅ Optimized Pattern for MCP-Zero Discovery`*
`{`
  `name: "kilotest_list_web_quality_reports",`
  `description: "Retrieves a historical catalog of ensemble front-end quality test reports for web pages. Use this to check whether a specific URL has already been audited for accessibility (WCAG), usability, and W3C standards conformity."`
`}`

**Prefix your tools:** Use a uniform prefix like `kilotest_` to prevent namespaces from colliding with other standard testing tools when flattened into an agent’s runtime.

**Inject key synonyms in descriptions:** Notice how the bad example just repeats the name. The optimized description explicitly seeds semantic keywords (**accessibility, WCAG, usability, standards, audit**). If an agent thinks, *“I need to check if this site is accessible for screen readers,”* the embedding vectors will match your tool.

### **2. Deepen Your Parameter Schemas**

MCP-Zero models often inspect input expectations before mounting a server to ensure they can fulfill the schema requirements. Provide dense descriptions for arguments instead of generic labels:

`"url_filter": {`
  `"type": "string",`
  `"description": "Optional target web page URL to filter reports for (e.g., 'https://example.com'). Helps find existing accessibility and front-end compliance history for this specific site."`
`}`

(Note from maintainer: This feature does not yet exist, so this is an example illustrating a principle but cannot be applied verbatim.)

### **3. Maximize Your Centralized Registry Metadata (package.json)**

Since kilotest is a public npm-published server already registered on community indexes (like Smithery and Glama), ensure your package file is effectively feeding their background indexers. MCP-Zero ingestion scripts crawl these registries and rely on the keywords and description tags to build their top-level server embedding maps.

Update your package.json to feature dense, functional keywords:

`{`
  `"name": "kilotest",`
  `"description": "Model Context Protocol (MCP) server for Kilotest ensemble web testing. Runs over 1,300 front-end tests across multiple rule engines covering WCAG accessibility, usability, performance, and web standards.",`
  `"keywords": [`
    `"mcp",`
    `"model-context-protocol",`
    `"mcp-server",`
    `"accessibility-testing",`
    `"wcag",`
    `"web-quality-audit",`
    `"automated-qa",`
    `"ensemble-testing"`
  `]`
`}`

### **4. Provide a "Capability Discovery" Tool**

A useful pattern for MCP-Zero discovery loops is exposing a zero-argument metadata tool, such as kilotest_get_server_capabilities. If an agent routes to your server but needs to confirm exactly what it can check before running an audit, this lightweight tool can return a deterministic list summarizing the specific rule engines inside kilotest.

Here are both the **TypeScript schema definitions** to update your tool definitions in code, and an **automated script** to generate an optimized manifest file (`mcp-manifest.json`) for your npm release.

### **1. The Optimized TypeScript Tool Schemas**

Replace your existing tool definitions with these semantically rich schemas. They are designed to rank highly when evaluated by an MCP-Zero semantic routing loop.

`import {Tool} from "@modelcontextprotocol/sdk/types.js";`

`export const KILOTEST_TOOLS: Tool[] = [`
  `{`
    `name: "kilotest_list_web_quality_reports",`
    `description: "Retrieves a historical catalog of ensemble front-end quality and compliance test reports. Use this tool to check if a specific web page or URL has already been audited for accessibility (WCAG), performance benchmarks, semantic HTML correctness, or usability standards.",`
    `inputSchema: {`
      `type: "object",`
      `properties: {`
        `url_filter: {`
          `type: "string",`
          `description: "Optional URL to filter reports for (e.g., 'https://example.com'). Helps identify existing compliance test history for a specific website."`
        `},`
        `limit: {`
          `type: "number",`
          `description: "Maximum number of historical reports to return. Defaults to 10.",`
          `default: 10`
        `}`
      `}`
    `}`
  `},`
  `{`
    `name: "kilotest_run_ensemble_audit",`
    `description: "Triggers a live, comprehensive front-end engineering audit on a target URL. Runs 1,300+ automated test checks across 12 rule engines simultaneously to evaluate WCAG accessibility compliance, mobile responsiveness, SEO configurations, and core web vitals performance.",`
    `inputSchema: {`
      `type: "object",`
      `properties: {`
        `url: {`
          `type: "string",`
          `description: "The absolute web page URL to inspect (must include http:// or https://)."`
        `},`
        `scan_depth: {`
          `type: "string",`
          `enum: ["single_page", "shallow_crawl"],`
          `description: "Depth of the quality sweep. 'single_page' tests only the target URL; 'shallow_crawl' includes immediately linked internal assets."`
        `}`
      `},`
      `required: ["url"]`
    `}`
  `},`
  `{`
    `name: "kilotest_get_server_capabilities",`
    `description: "Exposes a metadata summary of the 12 underlying rule engines configured inside this kilotest instance. Run this zero-argument tool to inspect exactly what front-end compliance standards (such as WCAG 2.2, W3C HTML, or performance budgets) this server is currently capable of evaluating.",`
    `inputSchema: {`
      `type: "object",`
      `properties: {}`
    `}`
  `}`
`];`

### **2. Auto-Generation Script (`generate-manifest.js`)**

MCP-Zero frameworks and platform indexers often ingest a static metadata file to cache tool definitions before spawning your server.

Create this file in your project root as `scripts/generate-manifest.js`. It pulls details directly from your package config and spits out a completely optimized index file.

`import fs from 'fs';`
`import path from 'path';`

*`// Read your existing package.json`*
`const packageJsonPath = path.resolve(process.cwd(), 'package.json');`
`const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));`

*`// Construct the high-fidelity MCP discovery manifest`*
`const mcpManifest = {`
  `manifest_version: "1.0.0",`
  `server: {`
    `name: "kilotest",`
    `version: pkg.version,`
    `description: "Official Model Context Protocol (MCP) server for Kilotest ensemble web testing. Programmatically evaluates front-end code bases across 1,300 validation checks covering WCAG 2.1/2.2 accessibility, performance budgets, markup standards, and cross-browser UX compliance.",`
    `homepage: pkg.homepage || "https://kilotest.com",`
    `routing_tags: [`
      `"accessibility", "wcag", "web-standards", "html-validation",`
      `"ux-audit", "front-end-qa", "performance-benchmarks", "automated-testing"`
    `]`
  `},`
  `// Static schema fallback for zero-install discovery loops`
  `discovery_schemas: {`
    `transport: "stdio",`
    `recommended_namespace: "kilotest"`
  `}`
`};`

*`// Write it to your distribution/root folder`*
`const outputPath = path.resolve(process.cwd(), 'mcp-manifest.json');`
`fs.writeFileSync(outputPath, JSON.stringify(mcpManifest, null, 2));`

``console.log(`✅ MCP-Zero Discovery Manifest successfully written to: ${outputPath}`);``

### **How to use this in your workflow**

> 1. Add a generation step to your package.json scripts:
>    `"scripts": {`
>      `"build": "tsc && node scripts/generate-manifest.js"`
>    `}`
> 2. When you run your build pipeline, it will ensure that both your active runtime code and your static metadata file match perfectly.
> 3. Make sure `mcp-manifest.json` is included in your files array in `package.json` so it gets published to **npm**.

### **Other actions**

1. Create the **underlying handler function** for the new `kilotest_get_server_capabilities` tool.
2. Create a **GitHub Action configuration** to automatically validate these schemas on push.

## Widen test-request duplicate detection (completed)

The duplicate check in `addTestRequest` (`util.ts`), reached by all four test/retest request paths (UI `/requestTest.html` and `/requestRetest.html`; API `requestTest` and `requestRetest` operations), compares an incoming request only against other requests currently pending in `db/jobs/testRequests.json`, i.e., submitted but not yet manually approved by the maintainer into a job. Once a pending request is approved into a job (`web/enqueue/index.ts`), all pending requests for that URL are cleared from `testRequests.json`, so this shared check cannot recognize a duplicate against a request that has already been approved, is currently running, or has already completed. An identical request submitted after approval triggers a fresh alert rather than being filtered.

The four paths differ in what, if anything, they check before reaching this shared dedup, and none of the four closes the gap:

- UI `requestTest` (`web/requestTest/index.ts`) additionally calls `getRequestability`, rejecting the request outright if the URL matches a claimed or queued job. This screens out most already-approved, not-yet-completed requests for a new test, but not ones for a completed report, since `getRequestability` does not consult reports.
- API `requestTest` (`api/requestTest.ts`) additionally checks `getReportExtracts` and rejects the request if a report already exists for the same description and URL, but, unlike the UI path, does not call `getRequestability`, so it does not screen out a URL that is currently claimed or queued as a job.
- UI `requestRetest` (`web/requestRetest/index.ts`) and API `requestRetest` (`api/requestRetest.ts`) call neither `getRequestability` nor a same-description-and-URL report check; each only confirms the report being retested is still the latest one for its page before falling through to the shared dedup.

Consider widening the shared `addTestRequest` check itself, so that all four paths benefit uniformly, to also compare against approved, claimed, queued, or completed requests, for example recently created jobs or reports for the same URL and description, and if so over what time window, rather than continuing to rely on each path's own inconsistent pre-check.

## Tighten the DMARC policy after adding aggregate reporting (revised and completed)

Resend mail is already fully authenticated and passes DMARC; what remains undecided is reporting and enforcement, not SPF alignment. Confirmed on 2026-09-17 by querying DNS live and by inspecting the full headers of a received alert: SPF passes against a Resend-configured MAIL FROM on `send.kilotest.com` (MX `feedback-smtp.us-east-1.amazonses.com` and TXT `v=spf1 include:amazonses.com ~all`, the pair created by Resend’s “Enable SPF” option), which aligns with the `kilotest.com` From domain under relaxed alignment, and DKIM passes with an aligned `d=kilotest.com` signature (`s=resend`, key published at `resend._domainkey.kilotest.com`). The captured message showed `dmarc=pass` at both the Porkbun forwarding hop and the final Zoho mailbox; Porkbun’s SRS rewrite makes post-forward SPF unaligned, so DKIM is what carries DMARC across the forward. `ALERT_FROM` is `info@kilotest.com`, matching the DMARC domain, and `MANAGER_EMAIL` is the same Porkbun-forwarded address, which terminates at `pool@jpdev.pro` on Zoho.

The maintainer sends no mail as `@kilotest.com` (human mail is sent from `pool@jpdev.pro`), so Resend alerts are currently the domain’s only legitimate sending stream, and tightening DMARC risks no known sender. If transactional mail is added later it will also use `info@kilotest.com`; any provider other than Resend would need its own SPF and DKIM alignment configured before deployment under an enforced policy. The root-domain SPF record has no Resend mechanism and needs none: SPF is evaluated against the MAIL FROM domain, which for Resend is `send.kilotest.com`, not the root domain.

Consider: (1) adding `rua=mailto:info@kilotest.com` to the `_dmarc.kilotest.com` record while still at `p=none` (aggregate reports are zipped XML and reach Zoho through the existing forward); (2) after a few weeks of reports confirm that no unexpected stream is failing, moving to `p=quarantine`, optionally with a `pct=` ramp, and later to `p=reject`; (3) reflecting any DNS change in `docs/SERVICE.md` and its DNS CSV.

## Document alerting (completed)

Document when and how Kilotest sends alerts to its maintainer, including the subscription to Resend and the DNS configuration for Resend authentication.

## Serve explanation page for human MCP requests (completed)

When the `/mcp` path is requested without a `text/event-stream` accept header, serve an HTML page explaining that the endpoint is for AI agents and providing a link to the AI tutorial.

## Deploy revisions (completed)

Deploy the revisions to the codebase.

This requires:

- Update the configuration of [UptimeRobot](https://dashboard.uptimerobot.com/) to monitor Kilotest as a whole via the site root. Reconfigure the existing monitor from `https://kilotest.com/qai` to the Kilotest path `https://kilotest.com/`, so that it continues monitoring service health.
- Merge the changes to `main`.
- Pull the new `main` branch to the server.
- Update the actual server copy of `/etc/caddy/Caddyfile` (as root) and run `sudo systemctl reload caddy`.
- Restart Kilotest in PM2.

## QAI integration (completed)

The `jrpool/qai` repository is independent of this `jrpool/kilotest` repository, and they are published as two distict packages. That separation is due to an organizational requirement that no longer exists. Since the QAI application is a tutorial showing users how to use Kilotest, and the tutorial of Kilotest also shows users how to use Kilotest, it is appropriate to convert QAI to a part of the Kilotest codebase. QAI is currently deployed with the URL `https://kilotest.com/qai`, and that would not need to change. `Caddyfile` would be simplified (see the copy in `docs/SERVICE.md`). The QAI code would need to be copied into Kilotest. Any architectural incompatibilities would need to be discovered and resolved. Locally, `qai` is a sibling repository of `kilotest` on this host. Note that QAI health is currently monitored by UptimeRobot, and periodic health monitoring of Kilotest is proposed as the next backlog item after this one, so health monitoring should be handled in such a way that it will be appropriate after both backlog items are completed.

## Implement periodic monitoring (completed)

Status: Implementation complete; UptimeRobot reconfiguration remains.

A periodic GitHub Actions workflow has been implemented in `.github/workflows/periodic-smoke-tests.yml`, configured to run daily at 12:00 PM UTC (noon). The workflow runs `smokeTest.ts` against the deployed service at `kilotest.com`, validating that all public GET and POST paths are reachable and forwarded by Caddy (i.e., not returning bare 404 errors). This allows code and infrastructure to be deployed together, then validated by the periodic check independently. The workflow can also be triggered manually from the GitHub Actions interface.

Documentation for the periodic monitoring workflow has been added to `docs/SERVICE.md` in a new “Periodic monitoring” section, including notes on UptimeRobot health monitoring.

Remaining task: update the configuration of UptimeRobot to monitor Kilotest as a whole via the site root. Use the UptimeRobot console to reconfigure the existing monitor from `https://kilotest.com/qai` to the Kilotest path `https://kilotest.com/`, so that it continues monitoring service health after the QAI integration is deployed and verified live.

## Details

### QAI integration details (completed)

#### Context

QAI (`/Users/pool/Documents/Topics/repos/a11yTesting/qai`, sibling repo) is a small standalone Node HTTP server deployed at `https://kilotest.com/qai` on port 3001, reverse-proxied separately from Kilotest (port 3000) by Caddy. The two-package split was required by an organizational constraint that no longer applies. QAI’s own purpose, teaching users how to connect an AI platform to Kilotest’s MCP tools, makes it naturally a part of Kilotest’s own tutorial content, so the backlog calls for folding QAI into the Kilotest codebase as a single deployable service.

Investigation turned up an important existing fact. `kilotest/web/tutorial/` and QAI’s own tutorial-and-comments feature share the same alert env vars (`MANAGER_EMAIL`, `ALERT_API_HOST`, `ALERT_API_PATH`, `ALERT_API_KEY`, `ALERT_FROM`) and the same comment-collection shape. Kilotest’s tutorial pre-dates QAI, so this similarity reflects QAI having been built by copying Kilotest’s tutorial-and-comments architecture, not the reverse. Kilotest’s `web/tutorial/` has since diverged into its own, much larger “Accessibility Testing Strategies” tutorial (641 lines) unrelated to QAI’s “add an MCP connector to Claude” walkthrough content, but it remains the established, proven pattern for a page-plus-comments module in this codebase (`answer{}`/`tutorialComment.html` wiring in `index.ts`). This is **not** a duplicate-content problem to reconcile: it is the existing template QAI itself was originally modeled on, now being reused directly instead of through a second, separately-deployed reimplementation. The work is: retire QAI’s standalone server/repo, and add QAI’s tutorial and comments pages to Kilotest as a second `web/<topic>` module pair, following the `web/tutorial/` pattern QAI was descended from.

Work will happen on the already-checked-out `qai` branch in the `kilotest` repo.

**Governing principle for structural and naming differences**: wherever QAI and Kilotest diverge in file naming, directory structure, or convention, do not default to Kilotest’s existing choice simply because Kilotest is the surviving repository. Evaluate both approaches on their merits and let the better design win, exactly as already decided above for documentation file naming (see “QAI’s documentation” below). This applies to structural questions too, not only naming: for example, QAI serves its static HTML and assets from a dedicated `public/` directory with a generic extension-to-content-type lookup (`web/qaiTutorial/`’s planned structure, described in the implementation steps below, instead follows Kilotest’s existing per-page `web/<topic>/index.ts` convention, since the new pages need the request-handling logic a plain static directory could not provide, but the underlying question of whether Kilotest’s codebase would benefit from a general-purpose static-asset directory or helper, rather than one `else if` branch per static file as `index.ts` currently has, is a legitimate structural question raised by this merge and worth a brief evaluation during implementation, even though it is not required to complete the merge itself).

#### What gets ported vs. retired

**Ported (QAI content has no Kilotest equivalent):**

- QAI’s “connect an AI platform to Kilotest” tutorial content (`public/tutorial.html`, 65 lines): becomes a new `qaiTutorial.html` page.
- QAI’s comment form (`public/comments.html`): becomes a new `web/qaiComment/` module, with GET and POST both handled there (reworked to Kilotest’s inline `fetch`-based submission convention rather than QAI’s full-page POST; QAI’s separate `public/comment-ack.html` acknowledgment page is not ported, see Decisions below).
- QAI’s comment-spam-management logic (length bounds of 20–1000 characters, and duplicate-resubmission rejection, that is rejecting identical text resubmitted within roughly 1000 seconds). This is generalized into a shared helper (see Decisions below) used by **both** the new `web/qaiComment/` module and the existing `web/tutorial/index.ts`’s `handleComment`, so Kilotest’s original tutorial comments gain the same spam protection.

**Retired (superseded by existing Kilotest infrastructure, or QAI-only machinery no longer needed once folded into one process):**

- `public/favicon.ico`: identical to Kilotest’s existing root `favicon.ico`; no porting needed, since the existing one is already served at `/favicon.ico`.
- `src/main.ts`, `src/requestHandler.ts`, `ecosystem.json`: QAI’s standalone server, routing, and PM2 config. Kilotest’s `index.ts` dispatch and `pm2.config.cjs` take over entirely.
- `src/alerts.ts`: Kilotest’s own `alerts.ts` (`sendAlert(subject, body)`) is a direct match; reuse it rather than porting a second copy.
- QAI’s own `tsconfig.json`, `eslint.config.mjs`, `package.json`, and CI workflow (`checks.yaml`): Kilotest’s root configs (`tsconfig.json`, `eslint.config.mjs`, `.github/workflows/ci.yml`) already apply to the whole repo, so no per-directory config is needed. Note that Kilotest’s `tsconfig` adds `noUncheckedIndexedAccess`, which QAI’s code was never checked against (expect to fix a few index-access sites when the ported code moves under Kilotest’s typecheck).
- QAI’s `db/comments.json` runtime data: not migrated (it is transient, ephemeral demo data, and the file is already gitignored in QAI); a fresh `web/qaiComment/comments.json` starts empty, exactly as `web/tutorial/comments.json` does today.

**QAI’s documentation, merged, not discarded:** QAI was built under an organizational requirement to exemplify best-practice software documentation, and its `docs/` is genuinely richer than Kilotest’s in several respects (Kilotest currently has only 2 ADRs; QAI has 9, plus architecture, requirements, and deployment docs Kilotest lacks entirely). The goal is for the merge to raise Kilotest’s documentation standard, not lose QAI’s. Concretely:

- **File and directory naming when both sides have a version of “the same” doc**: use whichever naming is more industry-standard, decided at implementation time. Do not default to “Kilotest’s name wins because it is the surviving repo”. QAI’s file names were themselves prescribed to follow industry-standard documentation practice, per its organizational requirement, so where the two conventions differ, QAI’s naming is the likely winner; confirm case by case rather than assuming.
- **ADRs** (`qai/docs/decisions/001`–`009`): QAI’s ADR format (frontmatter with `date`/`status`, `Context and problem`/`Considered options`/`Decision` structure) already matches Kilotest’s own (`kilotest/docs/decisions/001-api-design.md`, `002-coverage-tool.md`), the same convention. QAI’s own `002-adr-threshold.md` states the governing principle for what the ADR set should contain: its confirmation test is that “the ADRs describe all and only the strategic decisions manifested in the codebase.” That principle conflicts with the classic Nygard convention of never editing an ADR once written, since a set that must always describe current architecture cannot also be a frozen, append-only log. Kilotest resolves this conflict by adopting mutable, kept-current ADRs as its own explicit convention: a documented, deliberate departure from the stricter classic convention, and a recognized alternative position in the industry, not an idiosyncratic one. An ADR’s content can be edited as architecture evolves, and it remains named an ADR throughout; historical context belongs inside a current ADR when it helps a future maintainer (for example, “X was tried, but it had defects Y and Z, so X was replaced with R” helps prevent a regrettable reversion to X), rather than requiring a separate, frozen, superseded file to be kept around for that purpose. This convention itself should be written up as a revision to the ported `002-adr-threshold.md` (see below), so it is documented rather than assumed.
  - Only ADRs describing still-operative decisions are ported into `kilotest/docs/decisions/` as new, renumbered files, continuing on from Kilotest’s existing 001–002. Candidates for porting: `001-docs-directory.md` (the `docs/` plus `docs/decisions/` layout both repositories already use), `002-adr-threshold.md` (the ADR-writing policy itself, revised per the mutability convention above), `006-observability.md`, `007-git-workflow.md`, `008-internal-testing.md`, and `009-dependencies.md` (general engineering policies that are candidates to become repository-wide Kilotest policy, not QAI-specific). Confirm each candidate against Kilotest’s actual current practice during implementation, and edit its content as needed (reframing QAI-specific wording to repository-wide, updating anything no longer accurate) before porting: this editing is now consistent with Kilotest’s stated mutable-ADR convention, not an exception to it.
  - ADRs describing decisions specific to QAI’s former existence as an independent deployment are folded into the still-operative ADRs as historical context, not ported as separate files: `003-initial-routing.md` (chose independent deployment, the opposite of this merge), `004-prerelease-versions.md` (QAI’s own version-0.1.0 scoping), and `005-infrastructure-health.md` (QAI needing its own external monitoring because Kilotest lacked any). Where one of these adds genuinely useful context to a still-operative decision (for example, `003-initial-routing.md`’s reasoning belongs inside whatever ADR now documents Kilotest’s routing architecture, as a brief note on the independent-deployment approach that was tried and superseded by this merge), fold a short summary of it in; otherwise leave it recoverable only from `jrpool/qai`’s git history.
  - This merge is itself exactly the kind of decision QAI’s own `002-adr-threshold.md` says merits an ADR: a strategic choice with substantial effects on maintainability. Write a new Kilotest ADR documenting the QAI-integration decision itself, positioned last in the ported sequence.
- **`architecture.md`, `requirements.md`**: read these fully during implementation and fold any content still accurate and relevant to the merged codebase into Kilotest’s docs. Kilotest currently has no equivalent top-level architecture or requirements doc, while QAI’s organizational requirement produced these as a matter of course; evaluate whether Kilotest’s documentation would genuinely benefit from adopting a dedicated architecture or requirements doc at this level (per the governing principle above) rather than assuming `docs/SERVICE.md` is automatically the right destination just because it already exists. Content describing QAI-as-independent-service specifics, such as its own deployment topology, becomes historical once folded in.
- **`deployment.md`**: covers the same subject as `docs/SERVICE.md`, which already documents the real, merged deployment, so the two should become one file rather than two. Per the governing principle above, do not assume `SERVICE.md`’s name and existing shape automatically wins just because Kilotest already has it: read both in full during implementation and decide, on the merits of each (completeness, clarity, industry-standard naming for a deployment doc), which name and structure the merged file should keep, folding in whatever content the other has that it lacks.
- **`repository.md`, `project-vision.md`**: likely QAI-specific project-management framing (course requirements, repo conventions for a now-retired standalone repo); read in full during implementation to confirm, but expect these to be summarized into a short historical note rather than ported whole.
- **`future.md`, `manual-verification.md`, `ai-implementation-review.md`**: read during implementation. `manual-verification.md` may contain durable QA procedure worth folding into Kilotest’s own testing docs; `future.md` and `ai-implementation-review.md` are more likely point-in-time project-status artifacts, and are candidates for summary rather than full porting.
- **`progress-reports/`, `reviews/`**: sprint reports, a demo video, and peer reviews, purely historical, course-context artifacts with no forward-looking maintainer value. Retain only as a brief pointer or summary (for example one paragraph in the merge’s own ADR, or a short history-style note: “QAI’s original development history, including sprint reports and peer reviews, is preserved in the `jrpool/qai` repository’s git history”) rather than copying the files into Kilotest.
- **`docs/rulesets/qai-main.json`**: QAI’s GitHub branch-protection ruleset export. Kilotest already has its own equivalent (`docs/Smoke Test.json`, per `docs/SERVICE.md`); compare during implementation for any protection QAI enforced that Kilotest does not yet (for example QAI’s required-testing-before-merge ADR, `008-internal-testing.md`, appears to match Kilotest’s own branch protection already, but confirm), and otherwise do not port the file itself.
- **`README.md`**: QAI’s root README is project-management framing for a now-retired standalone repo; it is not ported as a file, but confirm that Kilotest’s own README and docs adequately cover the “connect an AI platform” use case QAI’s README foregrounded (they may already, via the new `qaiTutorial.html` page itself).

#### Decisions locked in

- **Route placement**: QAI’s content gets its own new page(s), independent of the existing `tutorial.html` (which has evolved into unrelated Kilotest-specific content). Working names: `qaiTutorial.html` (the “connect an AI platform to Kilotest” walkthrough) and `qaiComment.html` (the comment form), with a POST to `qaiComment.html` handling submission, matching Kilotest’s convention of a GET page and a same-named POST action seen elsewhere (for example `requestTest.html`).
- **Module structure follows the established one-topic-per-directory convention**: every existing `web/<topic>/index.ts` module (`web/enqueueForm/`, `web/ai0BalanceForm/`, `web/hideReportForm/`, and others) exports one `answer(pathTail, search)` function and pairs with exactly one `index.html` in the same directory, rendered via the shared `populateTemplate(import.meta.dirname, query)` helper in `util.ts` (already used by essentially every existing GET page). QAI’s content is ported as two such modules, not one directory holding differently-named files: `web/qaiTutorial/` (the walkthrough page) and `web/qaiComment/` (the comment form, exporting both `answer` for its GET page and `handleComment` for its POST action, mirroring `web/tutorial/index.ts`’s existing two-export shape). This was corrected during implementation from an earlier draft of this plan that proposed a single `web/qaiTutorial/` directory with distinctly-named HTML files and a new hand-rolled substitution helper; that draft duplicated `populateTemplate`, which already does the same job. A separate `web/qaiCommentAck/` module, considered at one point for an HTML acknowledgment page, was dropped once the response-shape decision below was reversed.
- **Comment validation and unified length limits**: `web/qaiTutorial/`’s and `web/qaiComment/`’s GET pages return `{status: ‘error’, message}` on failure exactly like any other `web/<topic>/index.ts` module, and Kilotest’s existing dispatch in `index.ts` already calls `serveError(getAbuseError(request, answerData.message), response, true)` automatically whenever an `answer[topic]` function returns an error status (see the generic `.html` GET dispatch at line 504), rendering the existing `error.html` template; no new error-response helper is needed there. The comment-submission POST path uses a different, JSON-based error convention instead (see the Acknowledgment response entry below). During implementation, validation was split into two helpers in `util.ts`: `checkCommentLength` (reusable length validation) and `checkCommentDuplicate` (reusable duplicate-submission detection, rejecting identical text resubmitted within roughly 1000 seconds). Both are called by `web/qaiComment/`’s `handleComment` and the existing `web/tutorial/index.ts`’s `handleComment`, so both comment endpoints enforce identical checks. Kilotest’s original tutorial comment length limit (500 characters) was raised to 1000 to match QAI’s limit, unifying the bounds; both endpoints now enforce a 20–1000 character range. This is a behavior change to `web/tutorial/` beyond the QAI port itself, and is worth calling out in the PR description as a deliberate, bundled improvement rather than scope creep.
- **Acknowledgment response: unify on `web/tutorial/`’s JSON/AJAX convention, not QAI’s HTML-page convention (reversed from an earlier draft of this plan)**: investigation during implementation found that `web/tutorial/index.html`’s comment form is a single-page AJAX widget (a `fetch('/tutorialComment.html', ...)` call that parses a JSON `{status}` response and updates an inline status region, with a live character counter, and no page navigation), while QAI’s `comments.html`/`comment-ack.html` is a traditional full-page POST that navigates to a separate acknowledgment page. Per this plan’s own “let the better design win” governing principle, `web/tutorial/`’s inline-feedback UX is the better design, so the new QAI comment form is built to match it, not the reverse: `web/qaiComment/` gets its own small `fetch`-based submission script (adapted from `web/tutorial/index.html`’s pattern) with an inline status region, submitting to `qaiComment.html` and expecting a JSON `{status: 'ok'}` or `{status: 'error', message}` response, exactly like the existing tutorial comment form. No HTML acknowledgment page, and no `populateTemplate`-based ack module, is built for either flow; `populateTemplate` is still used for the ordinary GET pages (`web/qaiTutorial/`, `web/qaiComment/`) themselves, just not for a comment acknowledgment.

#### Implementation steps

The steps below are sequential, but not each individually required to pass Kilotest’s full check suite (100% coverage, typecheck, lint, tests) on its own: for example, after step 1 alone the new `util.ts` helper exists but nothing calls it yet, which the 100%-coverage requirement would fail, and after step 4 alone the new modules are wired into routing but the Caddyfile and documentation steps are still pending. Commit and push freely at intermediate points on the `qai` branch (or a further feature branch off it) as work progresses, but only open the pull request to `main` once every step is complete and the full check suite passes, per Kilotest’s branch-protection rules (`docs/SERVICE.md`, “Branch protection”).

1. **Add shared comment-validation helpers to `util.ts`**: `checkCommentLength(content: string)` validates that a comment’s raw length is within the 20–1000 character bounds, returning either an ok result or an error result with the applicable message (“shorter than 20” or “longer than 1000”). `checkCommentDuplicate(comments: {timeStamp: string; content: string}[], content: string)` validates that a comment does not repeat, verbatim, a comment submitted within the last 1000 seconds, returning either an ok result or the duplicate-rejection message. Factor these out of QAI’s `requestHandler.ts` logic (lines 78–110 of that file) rather than rewriting from scratch. These are validation logic only, not response rendering, since rendering is already handled by the existing `populateTemplate`/`serveError` machinery (see Decisions above). `checkCommentDuplicate` uses Kilotest’s `timeStamp` format (not QAI’s ISO `dateTime` format) to integrate with the shape already used by `web/tutorial/index.ts`’s comments.json.

2. **Update `web/tutorial/index.ts`’s `handleComment` and raise its length limit from 500 to 1000**:
   - Call `checkCommentLength` on the raw content before sanitizing, and `checkCommentDuplicate` on the sanitized content before appending, so both checks apply to Kilotest’s original tutorial comments, returning `{status: ‘error’, message}` on any failure.
   - Raise the character limit from 500 to 1000 to unify with QAI’s limit, and update the form label in `web/tutorial/index.html` (maxlength and character-counter logic) to reflect the new bound.
   - No response-shape change: `handleComment`’s existing bare `{status: ‘ok’}`/`{status: ‘error’, message}` JSON responses, and the `index.ts` POST branch for `tutorialComment.html` stay as they are; only the validation calls and the limit are new.
   - Update `web/tutorial/tutorial.test.ts` for the new rejection paths (too short, too long, duplicate) and the raised limit.

3. **Create a single new web module**, `web/qaiTutorial/`, following the established one-topic-per-directory pattern and mirroring `web/tutorial/`’s unified approach:
   - `web/qaiTutorial/index.ts` exports both `answer()` (to serve the tutorial page) and `handleComment()` (to handle comment submissions), eliminating the need for a separate comments module.
   - `web/qaiTutorial/index.html` combines QAI’s tutorial content (from `qai/public/tutorial.html`), adapted with Kilotest-style title and meta tags (dropping “QAI” branding, for example `Tutorial: Connect an AI Platform | Kilotest`), followed by an integrated comment-submission section at the end, following the pattern established by `web/tutorial/index.html`. The comment form is a `fetch`-based, inline widget (character counter, `comment-diagnosis` status region, `fetch(‘/qaiTutorialComment.html’, {method: ‘POST’, ...})` parsing a JSON response) rather than a separate page, so users can submit comments without leaving the tutorial. This allows readers to reference the tutorial content while commenting, and to submit multiple comments on the same visit.
   - `handleComment` in `index.ts` enforces the unified 20–1000 character range via `checkCommentLength` and inline duplicate-checking (using ISO `dateTime` format for QAI comment timestamps, consistent with how the separate comments.json is structured), sanitizes, appends to a colocated `comments.json`, and calls the shared `sendAlert` from `../../alerts.ts` with subject `New QAI tutorial comment received`.
   - GitHub issue links in the ported HTML: repointed from `jrpool/qai/issues` to `jrpool/kilotest/issues`, since bugs against this content are now Kilotest issues (repo disposition is a separate post-merge decision, but the *content* should reflect its new home immediately, regardless).

4. **Rename modules for clarity: `web/tutorial/` → `web/tutorialWeb/`, `web/qaiTutorial/` → `web/tutorialAI/`**: The original tutorial is for humans using Kilotest’s web interface directly; the new tutorial is for humans who want to enable their AI agents to use Kilotest (by connecting the MCP server). Parallel naming makes this distinction clear to contributors and users alike. Rename all related identifiers:
   - Directory: `web/tutorial/` → `web/tutorialWeb/`
   - Directory: `web/qaiTutorial/` → `web/tutorialAI/`
   - Environment variables: `TUTORIAL_COMMENTS_PATH` → `TUTORIAL_WEB_COMMENTS_PATH`, `QAI_TUTORIAL_COMMENTS_PATH` → `TUTORIAL_AI_COMMENTS_PATH`
   - Route names: `tutorialComment.html` → `tutorialWebComment.html`, `qaiTutorialComment.html` → `tutorialAIComment.html`
   - Imports in `index.ts`: aliases like `answer as tutorialWeb`, `handleComment as handleTutorialWebComment`, `answer as tutorialAI`, `handleComment as handleTutorialAIComment`
   - Test files: `web/tutorialWeb/tutorialWeb.test.ts`, `web/tutorialAI/tutorialAI.test.ts`
   - HTML titles and content: "web tutorial" and "AI agent tutorial" terminology
   - Redirects: `/qai/` and `/qai/comments` still 301-redirect to `/tutorialAI.html` (keeping the old paths working for backward compatibility)

5. **Wire into `index.ts`** (mirroring the `tutorialWebComment.html` pattern at lines 34, 82–154, 189, 930–941):
   - Import `answer` and `handleComment` from `web/tutorialWeb/` and `web/tutorialAI/`, with appropriate aliases (following the existing import-aliasing convention at lines 38–69).
   - Add both `tutorialWeb` and `tutorialAI` to the `answer{}` dispatch table. Both are plain `.html` GET pages, so they are picked up automatically by the existing generic `pageName.endsWith(‘.html’)` dispatch (line 504), with no new `else if` branches needed for GET.
   - Add `tutorialWeb.html` and `tutorialAI.html` to `routes.GET`, and add `tutorialWebComment.html` and `tutorialAIComment.html` to `routes.POST` (lines 159–193).
   - Add `pageName === ‘tutorialWebComment.html’` and `pageName === ‘tutorialAIComment.html’` branches in the POST dispatch chain, calling the respective `handleComment` functions and responding with the same bare-JSON `{status: ‘ok’}`/`{status: ‘error’, message}` shape, so both comment forms share one response convention.
   - Redirect QAI’s old live paths to their new equivalents: add branches that 301-redirect both `/qai/comments` (the old `https://kilotest.com/qai/comments` path) and `/qai` (the old `https://kilotest.com/qai` root) to `/tutorialAI.html`. Check the longer `/qai/comments` path first, before checking the shorter `/qai` path (since pathname matching on path segments would match the shorter one too), so that existing bookmarks, search-index entries, and inbound links to the old QAI paths continue working rather than breaking once Caddy’s separate `/qai` proxy block is removed. Add `/qai` and `/qai/comments` to `routes.GET` alongside the other redirect-only aliases such as `/swagger.json`.

6. **Merge QAI’s documentation into Kilotest’s `docs/`** (see “QAI’s documentation, merged, not discarded” above for the full breakdown):
   - Revise `002-adr-threshold.md` while porting it, to state Kilotest’s mutable, kept-current ADR convention explicitly (see above), since this convention is what governs how the rest of this step is carried out.
   - Confirm each of `001-docs-directory.md`, `006-observability.md`, `007-git-workflow.md`, `008-internal-testing.md`, and `009-dependencies.md` still accurately describes Kilotest’s actual practice; port only the ones that do, as new, renumbered files in `kilotest/docs/decisions/`, continuing on from Kilotest’s existing 001–002, editing content as needed to reflect current, repository-wide reality.
   - For `003-initial-routing.md`, `004-prerelease-versions.md`, and `005-infrastructure-health.md`: fold any genuinely useful historical context from each into whichever still-operative ADR now covers the same architectural area (for example, `003-initial-routing.md`’s independent-deployment reasoning becomes a brief historical note inside the ADR that documents Kilotest’s current routing architecture). Do not port these three as separate files; their full original text stays recoverable from `jrpool/qai`’s git history.
   - Read `architecture.md`, `requirements.md`, `repository.md`, `project-vision.md`, `future.md`, `manual-verification.md`, `ai-implementation-review.md`, and `deployment.md` in full; fold durable, accurate content into Kilotest’s docs, evaluating for each whether the receiving doc should be an existing Kilotest file or, per the governing principle above, a new doc named and structured after whichever side’s convention is better (for `deployment.md` specifically, decide with `docs/SERVICE.md` whether the merged file keeps Kilotest’s name and shape, QAI’s, or a new one, rather than assuming `SERVICE.md` simply absorbs it). Write a brief historical-summary note for content in the remaining files that does not merit folding in.
   - Add a short pointer note (in the new merge ADR, or a dedicated short doc) preserving the existence of `progress-reports/`, `reviews/`, and `docs/rulesets/qai-main.json`, referencing `jrpool/qai`’s git history as the archive rather than copying those files in.
   - Write the new ADR documenting this integration decision itself, positioned last in the ported sequence.

7. **Update `smokeTest.ts`**: add `concretePaths.GET`/`.POST` entries for the new page names (`tutorialAI.html`, `tutorialAIComment.html`) and for the `/qai`/`/qai/comments` redirect aliases, and a `postBodies` entry if the comment POST needs a sample body.

8. **Update the Caddyfile copy** (`/etc/caddy/Caddyfile` on the server is tracked as a copy in `docs/SERVICE.md`):
   - Remove the `redir /qai /qai/ 301` and `handle_path /qai* { reverse_proxy localhost:3001 }` blocks, since QAI no longer runs as a separate process; the old `/qai` and `/qai/comments` paths are now redirected at the application layer instead (see step 5), so Caddy needs no special-case handling for them beyond forwarding them like any other allowed GET path.
   - Add the new page path(s), including `/qai` and `/qai/comments`, to the `@allowedGET`/`@allowedPOST` matchers.
   - Update `docs/SERVICE.md`’s copy of the Caddyfile to match, and note in that doc that QAI is no longer a separately-deployed application (the `docs/SERVICE.md` “Applications” section currently implies other apps like QAI could live at `/opt/jpdev/xyz`; leave that generic note as is, and just remove the QAI-specific proxy config).
   - The user will update the actual server copy and run `systemctl reload caddy` just before restarting Kilotest in PM2 after pulling a version containing the QAI integration.

9. **Tests**: The test files are already in place from step 4 (`web/tutorialWeb/tutorialWeb.test.ts` and `web/tutorialAI/tutorialAI.test.ts`), mirroring the structure and unit-testing both `answer()` and `handleComment()` directly. Rely on the existing `index.test.ts` integration tests to exercise the renamed routes once wired into `index.ts`’s dispatch (adding assertions there for the new paths and POST handler). Confirm 100% coverage is maintained per the `c8` config in `package.json` (branches, functions, lines, and statements all at 100%).

10. **Retire the QAI repo**:
    - Confirm with the user whether `jrpool/qai` on GitHub should be archived, left as read-only history, or deleted, once the port is verified working in Kilotest. This plan does not delete anything in `/Users/pool/Documents/Topics/repos/a11yTesting/qai`; that is a separate, explicit decision for the user to make after the merge lands and is verified in production.
    - Do not remove QAI’s existing UptimeRobot monitor. Instead, once the new `qaiTutorial.html`/`qaiComment.html` paths are live, reconfigure that monitor’s target so it continues watching a Kilotest path (for example the site root, or the new tutorial path) rather than the now-defunct `https://kilotest.com/qai`, effectively expanding its existing scope from monitoring QAI’s health specifically to monitoring Kilotest’s health as a whole. This closes the monitoring gap the original backlog note flagged, and does so by extending a monitor that already works rather than waiting on a new one (Kilotest’s own health-monitoring backlog item, or the “periodic smoke-test session” item, can still be pursued separately and later, but neither is a precondition for this reconfiguration).

#### Open question to resolve after the merge is verified live

- Disposition of the `jrpool/qai` GitHub repo once the new pages are confirmed working in production (archive, delete, or leave as read-only history). This is not needed to implement the merge itself.

#### Verification

- `npm run typecheck`, `npm run lint`, and `npm test` all pass in `kilotest` with the new module included, and coverage remains at 100%.
- Run `npm start` locally, then manually visit the new tutorial path and submit a test comment; confirm it is appended to the new `comments.json` and, with alert env vars set, triggers `sendAlert`.
- Run `node smokeTest.ts` against a local instance (or the deployed one, post-deploy) to confirm the new paths are both allowlisted in `routes` and reachable.
- After deploying: visit the old `https://kilotest.com/qai` and `https://kilotest.com/qai/comments` URLs directly and confirm each returns a 301 redirect to `/qaiTutorial.html` and `/qaiComment.html` respectively, per the redirect added in step 4, rather than a bare 404, now that Caddy’s separate `/qai` proxy block is gone.
