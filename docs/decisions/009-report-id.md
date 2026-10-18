---
date: 2026-10-17
status: accepted
---

# Report identifier

## Context, problem, and decision

Kilotest identifies each report with a string composed of the creation time stamp of the job that produced the report, in `YYMMDDTHHmm` format, and a random alphanumeric suffix, joined with a hyphen (example: `260503T0432-x9z`). The storage layer already treats this composed string as a unit: it is the report filename stem, the job identifier, and the value emitted as the report `identifier` in API responses.

Formerly, however, the request surfaces treated the identifier as two parameters, `timeStamp` and `jobID`, so that URLs had the form `/api/listIssues/{timeStamp}/{jobID}` and MCP tools took separate `timeStamp` and `jobID` inputs. The two components were never decomposed for separate semantic use: every split site recombined them immediately or validated them separately for no benefit. The split representation therefore added parameters, path segments, and boilerplate without adding meaning.

The identifier is now consistently treated as a unit named `reportID`, validated by a single `isReportID` predicate. Routes that had `{timeStamp}` and `{jobID}` path parameters now have one `{reportID}` parameter. The name `reportID`, rather than `jobID`, is used because a job is ephemeral (typically a few minutes), while a report lives indefinitely and is consulted repeatedly.

Because human users may have bookmarked web URLs containing the two-segment tail, legacy web paths redirect permanently (301 for GET, 308 for POST) to the single-parameter URLs, preserving query strings. The REST API and the MCP interface had no known consumers when this change was made, so they were cut over without transitional compatibility; the external registry listings (`openapi.yaml`, `server.json`, `lhm.plugin.json`) were updated quasi-simultaneously.
