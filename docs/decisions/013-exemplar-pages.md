---
date: 2026-11-22
status: accepted
---

# Exemplar pages and the iframe exemplar

## Context and problem

Kilotest aggregates reports from 12 rule engines, whose rules may duplicate, disagree, and leave gaps. Pages built so the correct results are known in advance let rule-engine creators, Testaro maintainers, and others check whether the engines behave as expected and identify opportunities for improvement. This decision establishes a collection of such exemplar pages and specifies the first one, which tests whether rule engines can examine the descendants of iframes.

Requirements already established:

- Exemplars are self-documenting: each page contains an introductory paragraph, the exemplary defects, and defect-free counterparts for contrast.
- Exemplars are pages of a dedicated registry site, “Kilotest exemplars”, so they do not share or affect the quality profile of the Kilotest site itself and would not be wrongly faulted by any future inter-page consistency tests.
- Exemplar reports are included in every feature except the issue aggregation of “What are the main issues?” (listTopIssues). In particular, they remain visible to the features that show which rule engines were prevented, which pages prevented them, and which rules duplicate each other, because exemplars are designed to produce legible signals there.
- Because the aggregation features are currently web-only only for expediency, the exclusion is attached to the shared data function, not to the web caller, so a future API or MCP endpoint inherits the same policy.
- Only the frame sources that must be cross-site are hosted outside the Kilotest server, on GitHub Pages. A subdomain of kilotest.com would add a same-site cross-origin case, but that is deferred infrastructure, not part of this decision.

## Decision

### Registry site

A site named “Kilotest exemplars” is created by the first approved test request for an exemplar page. The name is reserved: a new exported helper, `getExemplarPageIDs()`, resolves the site by the existing site-name-key normalization (rather than by a hardcoded siteID, which would not survive registry reconstruction) and returns the set of its page identifiers. This helper is the single source of truth for identifying exemplar reports.

### Exclusion from issue aggregation

`getViolationData` in `util.ts` gains an option, `excludeExemplars`, defaulting to `false`. When true, it omits the latest reports whose `extract.pageID` is returned by `getExemplarPageIDs()`. Only `web/listTopIssues` passes `excludeExemplars: true`. `web/listRuleMatches` and any future callers keep the default, since exemplar findings are signal there, not noise.

### Hosting and routing

Exemplar pages live in a root-level `exemplars/` directory as static HTML files, served at `/exemplars/<name>.html`:

- The existing `*.html*` GET route pattern already authorizes these paths. A dedicated branch is added to the GET handler before the generic `.html` web-page branch: when `pageName` is `exemplars`, it reads `exemplars/${pathTail}`, rejects empty tails, `..` segments, and non-`.html` names, and serves the file as `text/html` with a `content-location` header.
- Placing the directory at root level keeps the files outside `web/`, so `htmlhint web error.html` does not lint them. That escape is necessary because the files contain deliberate violations of the very rules htmlhint enforces.
- The pages carry `<meta name="robots" content="noindex">` and are omitted from `sitemap.xml`. They are not disallowed in `robots.txt`: a `Disallow` would prevent crawlers from fetching the pages and therefore from ever seeing the `noindex` directive, leaving them indexable as link-only results.
- Each page states a version or date so a changed exemplar can be correlated with the reports produced before and after the change.

### Structural validation

Because deliberate defects exempt the files from htmlhint, nothing else would check them. A manifest, `exemplars/manifest.json`, lists each exemplar page and frame document, its purpose, and its intended defects (element identifier and expected finding, with the Testaro issue mapping where known). A test validates the manifest against the files and enforces only non-defective invariants (for example, that every testable element has a stable `id` and that each page documents its purpose), so an accidental second defect cannot silently contaminate an exemplar.

### First exemplar: `exemplars/iframes.html`

Purpose: determine which rule engines, if any, can test the descendants of iframes, distinguishing script-injection engines (which cannot cross the same-origin boundary) from tools that work through frame handles.

The page embeds these frames, each labeled and each `<iframe>` element itself defect-free (`title`, dimensions):

1. A same-origin frame, `src="/exemplars/iframes-frame.html"`.
2. A `srcdoc` frame whose document is inline.
3. A cross-site frame, `src="https://<owner>.github.io/kilotest-exemplars/iframes-frame.html"`, served by GitHub Pages from a dedicated public repository. `github.io` is on the Public Suffix List, so this is a different registrable domain and produces an out-of-process iframe in Chromium.

Each framed document is a small page containing the same fixed set of deliberate element-level defects, each on an element with a stable `id`, plus defect-free counterparts. The documents themselves are otherwise clean (`lang`, `title`), so every violation attributable to a frame must come from an intended defect inside it. The same defects also appear in the top-level document of iframes.html, on elements with `id`s distinct from the framed ones, so that a report on the page proves within itself that the in-iframe defects would have been found except for their location: an engine that reports the top-document defects but nothing framed is demonstrably failing at the frame boundary. The defect set is chosen so that every rule engine has at least one defect it can be expected to report: the “Which rules may be duplicates?” feature (listRuleMatches) identifies defect types whose rules are shared by many engines, minimizing the count of defects needed, and the set is supplemented with defects targeting the idiosyncratic rules of any engines left uncovered.

Every framed document, including the GitHub Pages copy, is registered as its own page of the “Kilotest exemplars” site. Testing each document directly provides the unframed baseline: an engine that reports the defects in the directly tested document but not in the framed copy is demonstrably failing at the frame boundary, not at the rules. Using an identical defect set in every frame source yields a per-engine coverage matrix across same-origin, `srcdoc`, and cross-site framing.

Deferred to later exemplar pages or revisions: `sandbox`ed frames (expected to produce preventions rather than violations), nested mixed-origin frames, and the same-site cross-origin case requiring a `kilotest.com` subdomain.

### Documentation

The web and MCP documentation note that `listPages` applied to the “Kilotest exemplars” site returns the defect exemplars. Generated documentation (`llms.txt`, `llms-full.txt`, OpenAPI) is regenerated with `npm run generate`.

## Implementation

1. Serving: create `exemplars/`; add a GET branch for `pageName === 'exemplars'` before the generic `.html` handler, reading `exemplars/${pathTail}` and rejecting empty tails, `..`, and non-`.html` names; add routing tests; add `noindex` to the exemplar files.
2. Exclusion: add `getExemplarPageIDs()` to `registry.ts`, add `{excludeExemplars}` to `getViolationData`, pass `true` from `web/listTopIssues`, with tests. Landing this before any exemplar reports exist makes it a no-op until they do.
3. Content: choose the defect set from `listRuleMatches` output; write `iframes.html`, `iframes-frame.html`, and `manifest.json`; add a test validating the files against the manifest.
4. GitHub Pages: create public repository `jrpool/kilotest-exemplars`, publish an identical `iframes-frame.html`, verify with `curl` that the response is 200 with no `X-Frame-Options` or CSP header, and point the cross-site frame at it.
5. Registration and verification: request tests of `iframes`, `iframes-frame` (local), and `iframes-frame` (github.io), creating the site by name on the first request; inspect the reports for a per-engine matrix across frame cases and for preventions; confirm exclusion in `listTopIssues` and inclusion in `listRuleMatches`.
6. Documentation and checks: update `llms.txt`, `llms-full.txt`, `capability.md`, and the tutorials; run `npm run generate`, `npm run lint`, `npm run typecheck`, and `npm test`.

## Consequences

- The `/exemplars/*` requests accumulate `pageViews` metrics like any other page; test traffic is expected there.
- GitHub Pages sends `cache-control: max-age=600`, so a changed cross-site frame source can take up to about 10 minutes to propagate. Retests of the cross-site exemplar should wait at least that long.
- The server sends no `X-Frame-Options` or `frame-ancestors` header today. If such headers are added later, `/exemplars/` responses must be exempted or the exemplar will silently stop exercising what it claims to test.
