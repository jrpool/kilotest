---
date: 2026-11-07
status: proposed
---

# Site/page ontology for tested pages

## Context and problem

Kilotest identifies a tested page only by its description, a free-text string of up to 100 characters stored in each report as `target.what`. The history of reports about a page is assembled by exact string equality on that description (`getPageReportExtracts`, `isReportAvailable`, and `getApprovedJobProperty` in `util.ts`), and requesters are asked to conform to “the naming convention used in this list of pages” without any statement of that convention.

In practice the descriptions follow an implicit convention: a site name, optionally followed by a page qualifier (“Farm Sanctuary”, “Farm Sanctuary contact”, “Farm Sanctuary giving”). As of 2026-11-07 the production `listPages` output contains about 215 pages, of which about 75 are subpages of about 140 sites. The convention has already drifted: “Women's Liberation Front contact” and “Women’s Liberation Front Sisterhood application” use different apostrophes, and “Foundation for Individual Rights and Expression” (fire.org) and “Foundation for Individual Rights and Expression (FIRE)” (thefire.org) appear as two sites. The flat list is also unpaginated, so it will become burdensome to people and costly to AI agents if the page count grows into the thousands.

Issue #207 proposed an organization/site/page ontology. Human and AI usage of Kilotest is minimal at the time of this decision, so a breaking change now has negligible impact on users, whereas the same change later would not.

## Considered options

- Status quo: keep the flat page description, possibly with a written naming convention.
- Organization/site/page, as originally proposed in Issue #207.
- Site/page, as proposed in a comment on Issue #207.
- Grouping only: keep the data unchanged and group pages by description prefix in the `listPages` output.

## Decision

Site/page. The organization level was rejected because few tested organizations have more than one site, and deciding whether a site (for example, that of a partnership) belongs to an organization would add hard decisions without commensurate benefit. Grouping only was rejected because it would reduce payloads but would not stop the naming drift or the difficulty of conforming page names to the naming convention.

### Ontology

- A _site_ is a brand as presented to visitors, not a hostname. One site may span several hosts (for example, a donation page on a third-party fundraising host).
- A _page_ belongs to one site (see “Multiple site membership” for the possibility of more) and is identified independently of its name and URL, so that renaming a page or recording a change of its URL preserves its report history.
- Every page has a nonempty name. A site’s home page is named “home”, and it is displayed with that name, because an empty page name displayed as the site name alone would be less intuitive and could be mistaken for the site itself. In migration, a description that becomes a site name with no remainder yields a page named “home”.
- A _tested page_ is, as defined in ADR 001, a page about which at least one report is available (that is, stored in `db/reports`, not hidden, and readable). A _tested site_ is a site with at least one tested page. Wherever this record refers to tested pages or sites, or to a site’s pages in a listing, it means them in this sense.

### Multiple site membership

A page could plausibly belong to more than one site (for example, a page about a collaborative effort presented by several partners). Multiple membership is not implemented, because no tested page clearly requires it and it would complicate counts, summaries, site merges, and the choice of site under which to request a test. The design nonetheless keeps it cheap to add later, without a report migration or a breaking API change:

- The registry is the sole authority on which sites a page belongs to, and it records them as a list (currently always of one element). Reports record a site only as provenance (see “Recording site and page in jobs and reports”).
- Every API object that describes a page identifies its sites with a list (see “API and web interface”).
- Duplicate checks compare a requested URL with the URLs of all tested pages, not only those of one site.

### Page classes

Sites could be modeled as one kind of page class among others, such as “all accessibility statements” or “all pages with carousels”. Sites are instead kept as a distinct entity, because they do work that general classes would not: every page must belong to a site, a page name is meaningful only relative to its site name, and the drill-down (`listSites`, `listPages`), the request flow (`requestPageTest`), and site summaries are all organized by site. Folding sites into classes would require special rules for the class that is a site, which amounts to a distinct entity with a less clear model.

Page classes are not implemented, but two kinds are anticipated, and they belong in different places:

- _Page purposes_ (for example, accessibility statements, contact pages, and donation pages) are stable facts about a page. They belong in the registry, as a list of class identifiers in each page record. The page qualifiers in the current descriptions (“contact”, “donate”, “giving”, “subscribe”) are de facto page purposes, so the dry-run migration script could record each qualifier as a candidate purpose.
- _Features_ (for example, having a carousel) are facts about a version of a page, which can gain or lose a feature. They belong to reports, as a list in each entry of the report extract, so that a page’s history remains correct for reports from before the change. Features are the natural candidates for automatic assignment from test results, whereas page types would be assigned by requesters or by review.

Either kind can be added later without changing reports or the `sites` list in the API.

### Identifiers

- Sites and pages have nonsemantic identifiers: a type prefix (`s-` for sites, `p-` for pages) followed by a random string of lowercase base-36 characters: 6 for sites (about 2.2 billion possibilities) and 8 for pages (about 2.8 trillion), since pages necessarily outnumber sites. A newly generated identifier is checked against the registry and regenerated in the rare case of a collision. The prefix exists only so that an identifier of the wrong type fails clearly; no code derives any other meaning from an identifier.
- Random identifiers were preferred to serial ones (integers or serial base-36 or base-64 strings), although serial identifiers would be shorter and could not collide, for three reasons. First, restoring the registry from a backup older than some reports would roll a serial counter back, so new pages could receive identifiers that existing reports already carry. Second, a typo in a serial identifier usually yields another valid identifier, so a requester would silently get results about the wrong page, whereas a typo in a random identifier almost always yields “not found”. Third, separate Kilotest deployments issuing serial identifiers would collide, preventing their data from being merged. Base-64 strings were also rejected because they are case-sensitive and contain punctuation, which people misread and mistype.
- Page identifiers are unique globally, not only within a site, so a report is locatable by page identifier alone and a page reassigned to another site keeps its identifier and history.
- Times are never derived from identifiers. This is consistent with existing practice: report identifiers embed the creation time of a job, but `listIssues` orders reports by `jobData.endTime`.

### Registry

- `db/registry.json` is the registry. It maps each site identifier to the current site name, and each page identifier to a record of the list of identifiers of the sites it belongs to, its current page name, and its current URL.
- The registry records no creation times. Nothing would use them except a cleanup of _orphan_ records (those of sites and pages whose jobs all failed), and an orphan can be identified without them: a page with no available or hidden report and no queued or claimed job referring to it. A creation time would also be ambiguous, because a migrated record could only approximate it with the time of its earliest report. If a site later needs more properties, its value becomes an object, which changes only the registry file and the module that reads and writes it.
- A site record and a page record are created when the first job for them is created (on request approval), not when a request is received, so rejected requests leave no records.
- Listings show only sites and pages with at least one available report, matching the current behavior of `listPages`. A record whose first job fails therefore remains invisible until a later job succeeds.

### Recording site and page in jobs and reports

- Each job carries `sources.siteID`, `sources.pageID`, `sources.siteName`, and `sources.pageName`. Testaro passes `sources` through without reading it, and Kilotest already writes `sources.worker` there.
- `sources.pageID` is the identity of the tested page and never changes. `sources.siteID` is provenance only: the site under which the test was requested. Membership is determined solely by the registry, and no code groups reports by `sources.siteID`, so a page’s sites can change without any change to its reports.
- The names in `sources` record the names in effect when the job was created, so they are historical, whereas the registry holds the current names. They make each report self-describing. They also allow an approximate reconstruction of a lost registry, as a fallback when the R2 backup of the registry (see “Backup”) is unavailable: names from `sources` and the URL from `target.url` of the latest report about each page, and membership from `sources.siteID` of that report. Such a reconstruction loses any rename, URL change, or membership change recorded after the latest report about a page.
- `target.what` remains a plain-text display name (the site name followed by the page name), so that Testaro logs stay readable. No delimiter is reserved in it, and no code parses it.

### Storage

- Reports remain in flat `db/reports` and `db/hiddenReports` directories, named by report identifier.
- Site subdirectories were rejected because every retrieval receives only a report identifier, because reassigning a page to another site would require moving files (which `rclone copy` would duplicate on R2 rather than move), and because site membership is registry data, which a path would duplicate and, for a page of several sites, could not express.
- Report extracts (the `ReportExtract` objects that `getReportExtracts` caches in memory) gain `pageID`. Grouping by site joins the extracts with the registry, so it requires no extra report reads. The cache already rereads any report whose modification time or size has changed, so migrated reports are picked up without any cache file to delete.
- Supersession and page histories group reports by `pageID`, not by description. A report without `sources.pageID` (one restored from a backup older than the migration, or one completed from a job queued before the release) has no extract, so it is absent from listings and histories, but it is not quarantined, and it remains retrievable by its identifier. Rerunning the migration script gives it identifiers and returns it to listings.

### API and web interface

The API and the web interface change together in one release, because every API response links to its web counterpart in “URLs of similar requests for web users”. Identity logic (site and page lookup, history, and duplicate checks) lives in root modules (`registry.ts` for the registry, `requests.ts` for requests, and `util.ts` for reports) and is shared by API and web handlers.

- Site names have 1 to 80 characters and page names 1 to 120, after white space is normalized (trimmed, with each internal run reduced to one space) without notice to the requester. Page names may be longer because they must distinguish any two pages of a site, whereas site names are usually organization names. When these limits were set, the longest migrated names had 58 and 70 characters.
- `listSites` becomes the first level of the drill-down. Each entry has the site identifier, the site name, and the count of the site’s tested pages. It deliberately includes no report identifiers: reaching any page’s results requires `listPages` for its site, so that a requester learns which pages of the site have been tested before choosing one.
- `listPages` keeps its name although it now takes a site identifier, consistent with other endpoints (such as `listIssues`, which takes a report identifier) whose names omit their filters. It lists that site’s pages, each with its page identifier, name, URL, sites, and latest report identifier. This is a breaking change from the current `listPages` endpoint, which takes no parameters and lists all tested pages. For a site in the registry with no tested pages, it returns an empty list, so that only an identifier absent from the registry yields “not found”.
- Every API object that describes a page (in `listPages`, `listIssues`, and request responses, among others) identifies the page’s sites with a `sites` list of site identifiers, currently always of one element, never with a single site identifier. Implementing multiple membership later therefore changes only the length of the list.
- `requestNewTest` requests a test of a page of a site not yet tested. It takes a site name, a page name, a URL, a reason, and the existing `reviewImmediately` flag. It refuses the request if the site name, after normalizing case, punctuation, and apostrophes, matches the name of an existing site, and the refusal identifies that site and refers the requester to `requestPageTest`. The refusal is not overridable, because the remedy is immediate and approval could not apply it: Approving the request would either add the page to the existing site, which `requestNewTest` does not do, or create a second site with a nearly identical name. A site whose home-page registrable domain matches that of the requested URL is not a reason for refusal, but is reported as a _similar site_.
- `requestPageTest` (new) requests a test of a not-yet-tested page of an existing site. It takes a site identifier, a page name, a URL, a reason, and a `reviewImmediately` flag with the same meaning as in `requestNewTest`. Referring to the site by identifier eliminates confusion between similarly named sites (for example, “XYZ Inc.” and “XYZ Corp.”). Its closest ancestor request is the site’s `listPages`, so requesters normally see the site’s tested pages, and may recognize the wanted page among them, before requesting.
- The responses of `requestNewTest` and `requestPageTest` include a `possible duplicates` array, each entry naming an existing tested page, its URL, its sites, its latest report identifier, and the reason for the suspicion. Initially it is populated only by comparing the final URL after redirects with the URLs of all tested pages, not only those of the requested site, because the same page may already have been tested under another site. A match under another site is where a future response offering to add the page to the requested site (once multiple membership exists) would originate. Later reviews (for example, canonical URLs, titles and headings, or AI judgment as proposed in Issue #208) can add entries without changing the response shape.
- Under immediate review, a request with any possible duplicate or similar site is not tested immediately but is _referred_ to management review: It is added to the pending requests with a record that it was referred, and the response says so, explains why, and lists the possible duplicates (with their latest report identifiers) and similar sites (with their identifiers and counts of tested pages), so that the requester can use existing results at once instead of waiting. Under management review, possible duplicates and similar sites are shown to the manager with the request, and the manager decides. No parameter lets a requester override these checks, because an assertion that a page is distinct would cost an AI client nothing and would make the checks ineffective. If the pending requests are full, a referred request is refused as any other request would be, and the response still lists the possible duplicates and similar sites.
- A pending request records its target in the form that approval needs (a site name and page name for `requestNewTest`, a site identifier and page name for `requestPageTest`, or a page identifier for `requestRetest`), so that the registry is changed only on approval. Pending requests from before the release lack this form, so the manager empties the pending requests before the release is deployed.
- `requestRetest` is unchanged in form, since it already identifies the page by report identifier. The retest uses the page’s current URL in the registry, not the URL of the cited report, so that a recorded URL change takes effect on the next retest.
- Whether a job for a page is already queued or claimed is determined by its `sources.pageID` (for a retest) and by its `target.url` (for any request), not by description.
- The web interface gains a site list, a per-site page list showing URLs, and a `requestPageTest` form prefilled with the site identifier. The new-test form, `listIssues`, the hide and unhide report forms, the enqueue forms, the home page, and the AI tutorial are revised accordingly.

### Site-assignment rules

These rules govern both the migration and later reviews.

1. A page belongs to the site whose brand presents it to visitors, even if it is served from another host (for example, a form hosted by a form service or an event list hosted by a CRM vendor).
1. Separately branded domains of one organization (for example, a national affiliate’s domain) belong to the same site unless the brand presents them as distinct.
1. When no home-page entry exists for a site, the site name is the name of the organization or brand, and the remainder of the former description becomes the page name.
1. Variant spellings of one site name (punctuation, apostrophes, abbreviations in parentheses) are unified under one site with one canonical name.
1. Pages that describe Kilotest itself (for example, “Kilotest list issues”) belong to the Kilotest site.
1. Until multiple membership is implemented, a page presented jointly by several brands belongs to the site of a brand that hosts it or, if the joint effort has its own brand (for example, a coalition with its own domain), to a site of its own.

### Migration

1. A dry-run script (`scripts/propose-site-mapping.ts`, writing `db/siteMapping.json` by default) reads every report in `db/reports` and `db/hiddenReports`, proposes a site and page for each distinct description by longest-prefix matching against other descriptions, and writes a reviewable mapping file. It flags low-confidence proposals: no home-page entry, one name on different domains, near-duplicate names, and pages whose host differs from their site’s home page. It changes no reports.
1. The maintainer edits the mapping file to resolve flagged cases according to the site-assignment rules. The reviewed mapping is kept under version control as `docs/decisions/011-site-mapping.json`, which records how each former description became a site and page, and the migration script reads it from a path given as an option. Entries with identical site and page values are thereby merged into one page, whose report history combines theirs; this is how two descriptions of the same page (for example, of the home page of one site reached at two domains) are unified.
1. Before the migration runs, both `rclone copy` commands documented in `SERVICE.md` are run manually so that R2 is current, and a local archive of both report directories is made.
1. The migration script (`scripts/migrate-sites.ts`, which only previews unless given `--apply`) creates `db/registry.json` and adds the four `sources` properties to every report, changing nothing else. It first validates the edited mapping file and refuses to run if any report has a description with no entry, or if any entry has an empty site or page value. It then previews its plan, listing every merge of several descriptions into one page so that an accidental merge can be noticed, and proceeds only on confirmation. Because reports created before the migration have no site or page names of their own, their `sources.siteName` and `sources.pageName` record the names in the mapping. It is idempotent: it skips reports that already have identifiers, so it can be rerun after any restoration from an older backup.
1. Both `rclone copy` commands are run again immediately. Because every report changes, R2 moves every pre-migration copy into the dated `-old` folders, which become the rollback set. The log is checked to confirm this.

### Backup

`db/registry.json` is server-generated and irreplaceable, like reports, so a third cron line copies it to R2 with its own `--backup-dir`. The “Report protection” section of `SERVICE.md` is updated to describe this and the rerun-migration-after-restore step.

### Confirmation

To confirm the correctness of the implementation:

- Verify that every report in `db/reports` and `db/hiddenReports` has all four `sources` properties, that every `siteID` and `pageID` exists in `db/registry.json`, and that every page in the registry belongs to at least one site.
- Verify that no code groups or filters reports by `sources.siteID`, and that every API object describing a page has a `sites` list.
- Verify that the report history of every migrated page in `listIssues` contains the same reports as before the migration.
- Verify that R2 holds the pre-migration copies of all reports in the dated `-old` folders.
- Run `npm run generate`, `npm test`, and `npm run lint`, and confirm that every web URL cited in an API response resolves.
