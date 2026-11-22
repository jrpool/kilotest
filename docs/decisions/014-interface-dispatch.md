---
date: 2026-11-22
status: accepted
---

# Interface-based request dispatch

## Context and problem

`index.ts` is the single request dispatcher for every interface Kilotest serves: the web pages, the REST API, the MCP server, the Testaro worker callbacks, and the static and metadata assets. At roughly 1,700 lines it mixes all five jurisdictions: a route-authorization table (`routes`), page-policy sets (`managerPages`, `selfSubmittingManagerPages`, `noDirectGetPages`, `renamedPagePrefixes`, `legacyReportTails`), the Testaro job lifecycle (`processJobRequest`, `requeueJob`, `failJob`, `failDefectiveJob`), shared request plumbing (`serveError`, `getAbuseError`, `logRequestOnFinish`, metrics exclusion, worker authentication), and a method-switched dispatch chain (`handleRequest`, about 900 lines) that interleaves them. Jurisdiction boundaries exist only as the ordering of that chain, so the file is difficult to navigate and a change to one interface requires reading code owned by the others.

The MCP interface already demonstrates the intended shape: `mcp.ts` exports `handleMCP`, to which `index.ts` delegates once it recognizes `/mcp` requests.

## Considered options

- **Status quo.** Keep one dispatcher. The chain is verbose but explicit; its ordering is load-bearing yet documented only in comments.
- **Interface-prefixed URLs.** Require every route to carry an interface prefix (`/web/…`, `/api/…`, `/worker/…`), making first-segment classification trivial and partitioning `routes` completely among modules. This conflicts with the convention that unmarked URLs are human-facing and machine interfaces are marked. Only the web interface lacks a prefix today, and several paths can never carry one (`/`, `robots.txt`, `favicon.*`, `/.well-known/*`, `sitemap.xml`, `style.css`, `logo.png`), so the partition never becomes pure. It would also expose an internal organizational label in the public URL surface, the surface that is bookmarked, indexed, and distributed to tested-site owners, and would require redirects across all ~40 pages with `retireAfter` obligations. ADR 009 records that retiring redirects on an assumption of negligible usage already broke distributed `listIssues` links once.
- **Interface modules under the existing URLs.** Partition `routes` only where practical: each marked interface (`api`, `mcp`, `worker`) owns its patterns and its dispatch; unmarked patterns remain at root; `isPathAllowed` remains a single gate composed from the module lists. Classification uses the same first-segment and `.html` tests the chain already performs.

## Decision

The third option. `index.ts` is decomposed into per-interface dispatch modules, with the root module retaining jurisdiction classification and the unmarked route space. No URLs change.

Two shared leaf modules support the partition without import cycles, since the interface modules must not import root:

### `requestKit.ts`

Owns the per-request plumbing used by more than one jurisdiction: `serveError`, `getRequestIP`, `getAbuseError`, metrics exclusion (`isMetricsExcluded`), `recordPageMetric`, and `setHeaders` (which takes `response` as a parameter rather than closing over it as the former nested function did).

### `routeAuth.ts`

Owns `matchPath`, `isPathAllowed`, and the `routes` table, which it composes from each interface’s authorized-path list (`web/routePaths.ts`, `api/routePaths.ts`, `worker/routePaths.ts`, `mcpPath` for MCP) plus the unmarked patterns defined there. Root re-exports `routes` and `isPathAllowed`, so existing consumers (`checkinfo.ts`, `smokeTest.ts`, `routes.test.ts`) are unchanged. `mcp.ts` re-exports `mcpPath` for its own consumers.

### `web/index.ts`

Owns the `answer{}` registry, the page-policy sets, canonicalization including rename and legacy-tail redirects, the `pageViews` and `managerActivity` metric calls, `applySetCookie`, HEAD handling for the home page, and GET and POST dispatch for `*.html` pages, including the self-submitting manager pages and the tutorial-comment endpoints (which are `*.html` POSTs returning JSON). Exports `webRoutes`: GET `*.html*`, `/`, `/index.html`, and the POST page list.

### `api/index.ts`

Owns the API responder registry and dispatch for GET and POST `/api/*`. Dispatch is table-driven, but the table lives in `api/index.ts` rather than `api/routes.ts`: each entry pairs a service name with its responder, its cache volatility, and the function that builds the responder’s argument list from the path tail and parsed body. Driving dispatch from `api/routes.ts` was considered and rejected as-built, because that file is an OpenAPI-oriented contract lacking the per-service volatility and the body-to-argument ordering details the dispatcher needs. Exports `apiRoutes`: GET and POST `/api/*`.

### `worker/index.ts`

Owns worker authentication (`getBasicAuth`, `getWorkerCredentials`, `getAuthorizedWorkerName`), the job lifecycle (`queuePath`, `claimedPath`, `failedPath`, `failJob`, `requeueJob`, `failDefectiveJob`, `processJobRequest`, `browserRetryOrder`), and POST dispatch for `/worker/job` and `/worker/report`. Exports `workerRoutes` for those two paths.

### Root `index.ts`

Retains server lifecycle (`serve`, `startServer`, `runIfMain`), the `requestHandler` error boundary, smoke-probe handling, `logRequestOnFinish`, and the unmarked static and metadata assets (`robots.txt`, `openapi.yaml`, `llms.txt`, `capability.md`, `sitemap.xml`, `logo.png`, `favicon.*`, `style.css`, `/.well-known/*`, `/media/*`, `/exemplars/*`, tutorial images, `fullReport.json`). `fullReport.json` stays here rather than in `web/`: it is a linked download, not a page rendered through `answer{}`.

`routes` is composed in `routeAuth.ts` from the module lists plus the unmarked patterns, preserving the single authorization gate that runs before dispatch, so authorization and dispatch cannot silently diverge. A request’s interface is determined once, in root, by method, first path segment, and the `.html` test, reproducing the current chain’s precedence; the known overlap is `/exemplars/*.html`, which the `*.html*` authorization glob covers but the static handler serves. For POST requests the body is parsed once and the result is passed to the delegated handler, as the API, worker, and page handlers all consume it.

The `requestHandler` export keeps its signature, so `serve.ts` and the request-level tests (`routing.test.ts`, `routes.test.ts`, `indexServe.test.ts`, `index.test.ts`) remain valid throughout.

### Confirmation

The existing routing and integration tests exercise `requestHandler` end to end; the refactor is confirmed if they pass unchanged. A route-coverage check, verifying that every entry of the composed `routes` table reaches a handler in exactly one module, guards against the gate-and-handler divergence that the single table currently prevents by construction.
