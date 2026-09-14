# Backlog

Engineering tasks and risks that are not yet scheduled.

## Enable `noUncheckedIndexedAccess`

Adding `"noUncheckedIndexedAccess": true` to `tsconfig.json` was tested and deferred during the
migration. It produced 136 type errors across 26 files. Every added null guard introduces a
branch that the 100% c8 threshold then requires a test for, so the full conversion is a
non-trivial effort.

## Add observability of request metrics

Record per-endpoint request counts, latencies, and error rates so that Kilotest managers can
observe which API operations are most used and identify performance regressions.

## Align web/API terminology

The web layer uses `what` (page description) and `url` (lowercase), while the API and MCP tools
use `description` and `URL` (uppercase). `ReportExtract` uses `what`/`url`; `ReportBasics` uses
`description`/`URL`. A consistent vocabulary across all layers would reduce cognitive load for
future contributors. The renaming touches request handlers, type definitions, templates, and
output text.

## Dual-package hazard (testaro-issues)

`index.cjs` and `mcp.cjs` (CommonJS) and the `.ts` source files (ESM) each import
`testaro-issues` via their respective build outputs (`.cjs` and `.mjs`). Because
`testaro-issues` is read-only static data the two copies are harmless today. If a future
dependency with mutable state follows the same dual-format pattern, the two module instances
will not share state. Keep this in mind when adding or upgrading dependencies.
