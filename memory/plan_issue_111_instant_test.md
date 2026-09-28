---
type: project
name: Plan for issue #111 (instant testing)
description: Design and implementation of orderTest/orderRetest/awaitTest, the three-tool MCP addition (with REST parity) for immediate, auto-approved testing with an optional wait for completion. Implemented on the orderTest branch.
---

# Issue #111: instant-testing MCP tools (implemented)

Issue: [jrpool/kilotest#111](https://github.com/jrpool/kilotest/issues/111). The issue's own comment already
narrowed scope to a minimal increment: keep the existing single-worker Testaro polling
model, add new MCP tools, skip cost recovery, add only a lightweight anti-abuse gate.
This was implemented on the `orderTest` branch as three tools, `orderTest`, `orderRetest`,
and `awaitTest`, each with REST (`/api/*`) and MCP exposure, at the user's request for
full parity with the existing `requestTest`/`requestRetest` tools.

## Why two tools, not one

MCP `tools/call` is one request, one response; a tool cannot pose a question mid-call
and get an answer in the same call. The natural interaction is: order the test (fast,
always returns quickly), then, as a genuinely separate second call, decide whether to
wait for the result. Splitting into two tools avoids needing any new MCP machinery
(progress tokens, progress notifications) to solve the timeout problem below.

### The problem that killed the single-tool, blocking-wait design

An earlier design considered one tool with a `waitForCompletion` flag, where a `true`
call would enqueue and then block up to ~4 minutes for the report. This breaks if the
MCP client times out client-side before Kilotest responds: the client has stopped
listening, so nothing the server does (a final response, a progress notification) can
reach it, unless the client supplied a `progressToken` up front and progress
notifications were emitted early enough to carry the job identifier before the
timeout hit. That makes the wait's safety depend on client capabilities the caller may
not have, with no way for the server to detect or work around the gap.

The fix is not "notify them anyway", it is: never let identifier delivery depend on a
wait completing. `orderTest` returns immediately, always, with the identifier already
in hand, before any wait is ever proposed. This makes the whole progress-token /
client-timeout question moot for the ordering step; the identifier is guaranteed
delivered before any risky wait begins.

### Why a caller could never misuse awaitTest on a manually-approved job

Considered and rejected: restricting `awaitTest` to jobs specifically created by
`orderTest`, versus letting it work generically on any pending job by `timeStamp`/
`jobID`. This turned out to be moot: `requestTest`/`requestRetest` never hand the
caller a `timeStamp`/`jobID` at all (nothing exists yet), only instructions to poll
`listReports` later by description/URL. An identifier for a report only becomes
visible once the report is complete. So no caller can ever construct an `awaitTest`
call naming a manually-approved, still-pending job; the scenario that would need a
restriction cannot arise. No state-check or restriction is needed in `awaitTest`.
`orderTest` is the only path that exposes a pre-completion identifier at all, because
it enqueues synchronously and returns the job's own identifier immediately.

## Implementation notes

- `orderJob(target, reason)` in `util.ts` is the shared enqueue function backing both
  `orderTest` (target `{description, url}`) and `orderRetest` (target `{timeStamp,
  jobID}`), mirroring `processTestRequest`'s own dual-target design. It shares
  `testRequestsLock` with `processTestRequest` so the two can never race to enqueue
  duplicate jobs for the same page.
- `awaitJob(timeStamp, jobID)` in `util.ts` is the shared poll function backing
  `awaitTest`; it works for jobs from either `orderTest` or `orderRetest` (or, in
  principle, any job in the queue/claimed pipeline), since it only inspects
  `getJobNames()`/`getReportStats()`, not job origin. Poll interval and timeout are
  injectable via `AWAIT_JOB_POLL_MS`/`AWAIT_JOB_TIMEOUT_MS` so tests do not need to
  wait the real ~2-4 minutes.
- Full REST+MCP parity: `api/routes.ts`, `index.ts`'s `/api/*` POST dispatch, and
  `openapi.yaml` (regenerated via `npm run generate:openapi`) all cover the three new
  operations, alongside the MCP tool registrations in `mcp.ts`. `smokeTest.ts` needed
  no change, since it already smoke-tests the `/api/*` wildcard generically via one
  representative path, not every individual operation.
- Web-UI-equivalent URL fields (`'URLs of similar requests for web users'`) are `null`
  for `orderTest`/`orderRetest`/`awaitTest`'s own request, per explicit instruction:
  "web users will not be offered an order option." The *ancestor* request's web URL
  (e.g. `listReports.html`, `listIssues.html`) is still populated where one exists.
- `requestReferenceSchema` (`api/schemas.ts`) had to be widened from `method:
  z.literal('GET')` to `z.enum(['GET', 'POST'])`, since `awaitTest`'s ancestors,
  `orderTest`/`orderRetest`, are POSTs, unlike every other tool's GET ancestor.
- **`awaitTest` has two possible ancestors, not one**: a bug in the first cut had
  `awaitTest.ts` unconditionally naming `orderTest` as `'closest ancestor request'`,
  wrong for any identifier that actually came from `orderRetest`, and `awaitTest`
  cannot tell which one produced a given `timeStamp`/`jobID`, nor does it need to (its
  poll logic is origin-agnostic, per the earlier finding above). Considered and
  rejected: adding an `orderType: 'test' | 'retest'` parameter so `awaitTest` could
  report a single correct ancestor; rejected because it would force every caller to
  track and pass through a fact `awaitTest`'s own behavior never uses, reintroducing
  exactly the origin-coupling the generic design deliberately avoided. Adopted instead:
  `'closest ancestor request'` reports both `orderTest` and `orderRetest` as an array,
  only for `awaitTest` (every other tool keeps a single nullable ancestor object).
  Implemented by giving `thisRequestSchema`/`envelope` (`api/schemas.ts`) an optional
  `ancestorSchema` override parameter, mirroring the existing `similarWebSchema`
  override pattern, rather than widening the shared schema for every tool.
- The caller's stated `reason` is persisted onto the job itself (`job.sources.reason`),
  surviving into the eventual report exactly as `sources.worker` already does. No
  approval rule consults it yet; the user's rationale for keeping the field even though
  there is no human review is to accumulate real callers' stated reasons as data to
  inform more sophisticated, reason-aware approval rules in a later iteration.
- Shared response-shaping helpers landed in `api/util.ts`: `getRequestFailureReason`
  and `buildRequestDisposition`, extracted from `requestTest.ts`/`requestRetest.ts`
  (now refactored to use them) before `orderTest.ts`/`orderRetest.ts` were written
  against the same helpers.

## Tool 1: orderTest

- Reuses `requestTest.ts`'s existing validation (length/URL/target-safety checks
  already in top-level `util.ts`: `checkLength`, `isURL`, `isAllowedTarget`,
  `isAllowedRedirectTarget`).
- On success, enqueues directly into `db/jobs/queue` (bypassing the manual-approval
  inbox `db/jobs/testRequests.json` entirely), following the job-template population
  logic already in `web/enqueue/index.ts` (`jobName = ${nowStamp}-${jobIDSuffix}`,
  etc.).
- Approval gate (lightweight, per the issue's own comment, no human-in-the-loop):
  - Queue-size cap: env var **`JOB_QUEUE_MAX`** (not "instant-test"-scoped; `db/jobs/queue`
    is a shared resource fed by manual approvals, the web UI, and this tool, so the cap
    name must not imply a per-source quota). Checked against the live count of
    `db/jobs/queue` at call time via the existing `queuePath()` helper, not a
    self-maintained counter. Parallels the existing `TEST_REQUEST_QUEUE_MAX` (which caps
    the earlier-stage pending-approval inbox), as the sibling cap one stage further down
    the same pipeline.
  - Dedup against `queue`/`claimed`, reusing/extending `processTestRequest`'s existing
    per-URL/description dedup logic.
- Response, in all cases (accepted or rejected), returns immediately:
  - If rejected: says why (queue full, duplicate), no identifier.
  - If accepted: includes the job's `timeStamp`/`jobID` (or equivalent identifier),
    states that testing has begun and the report will be available via `listIssues`
    with those parameters, and asks the literal question: "Do you want to wait
    (typically about 2 minutes, occasionally up to 4 minutes) and be notified of
    completion?" The calling model decides and, if yes, makes a separate `awaitTest`
    call.

## Tool 2: awaitTest

- Takes the identifier (`timeStamp`/`jobID`) `orderTest` returned.
- Blocks, polling for report completion, until the report exists or a ~4-minute cap
  elapses.
- No progress notifications during the wait ("no notices until job completion or job
  timeout", per explicit instruction). This is a pure bounded poll.
- On completion or timeout, returns a response pointing at the same `listIssues`
  parameters already given, so both outcomes converge on the same follow-up action.
- Needs zero Testaro changes and zero MCP progress-notification plumbing: it derives
  status purely from Kilotest's own already-tracked state (`db/jobs/claimed/` vs. a
  completed report existing), not from any per-rule-engine signal.

## Deferred: detailed (per-rule-engine) progress reporting

Explicitly postponed; "the work is substantial even with generic progress reporting."
Findings, kept for whenever this is revisited:

- Testaro's `doActs.js` already has the needed hook, `opts.onProgress`, firing
  `actStart`/`actEnd` per act (including per rule-engine `test` act, with `which`
  naming the tool and `actEnd` carrying `outcome`/`elapsedMs`), built for Testaro's own
  issue #44.
- However, **no current Testaro entry point supplies `opts`**: `call.js`, `dirWatch.js`,
  and `netWatch.js` (the one a Kilotest Testaro worker actually runs) all call
  `doJob(job)` with a single argument. `opts.onProgress` is dead code from any shipped
  Testaro CLI/watch surface today.
- Consuming detailed progress therefore requires a **Testaro-side revision** to
  `netWatch.js` (to accept/forward progress, plausibly keyed off a job property rather
  than a runtime `opts` argument, since `netWatch.js`'s call site has no second argument
  to attach a callback to) plus a **new worker-to-Kilotest channel** (the worker
  currently only talks to Kilotest at claim-time and report-time; no mid-job channel
  exists). This is real, separate scope: a Testaro release plus a worker deployment
  update, before Kilotest's side could even be attempted. File as its own Testaro issue
  when picked up, not bundled into this work.
- Generic progress (this plan) needed none of this, since Kilotest already knows
  claimed-vs-reported from its own state.

## Tool 3: orderRetest

Same shape as `orderTest`, but for retesting a page with an existing report: target is
`{timeStamp, jobID}` of the report to retest, matching `requestRetest`'s own parameters.
Added at the user's explicit request, alongside full REST/MCP parity, for symmetry with
`orderTest`. Reuses the same `orderJob` function (see Implementation notes above) and the
same `awaitTest` tool for waiting; no separate wait tool was needed.

## Out of scope for this increment

- Cost recovery (explicit in the issue's own comment).
- Any change to the Testaro worker or its single-worker polling model.
- Any human-approval step for `orderTest`/`orderRetest`-originated jobs.

## Likely shared-code extraction

`requestTest.ts` and `requestRetest.ts` already duplicate a failure-reason mapping
(`requestResult` → human-readable string) and a `requestDisposition` envelope shape
(`'what happens next'` / `'how you can check for completion'` / `'how a web user can
check for completion'`). A third near-identical need in `orderTest.ts` makes this real
duplication (three call sites), worth extracting into small helpers in `api/util.ts`
before or alongside writing `orderTest.ts`. The outer response-body envelope
(`'tool collection'`, `'this request'`, etc.) is NOT worth extracting further; it is
already assembled from `getToolsFacts()`/`getResponseMetadata()` and the remaining
per-tool differences (method, URL, body shape, ancestor request) are genuinely
tool-specific.

See also `user_maintainer_context` for the legibility-for-future-maintainers priority
this design tries to respect (explicit state checks over implicit invariants, e.g. why
`awaitTest` needed no special-casing once the actual constraint was understood, rather
than adding a defensive check for a scenario that cannot occur).
