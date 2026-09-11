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
7. After migration: add observability for web UI and API usage.

## Testaro Dependency

Defer report-handling type definitions until Testaro's TypeScript conversion exports a stable `Report` type. Start with modules that don't touch the report schema.

## Report Normalization

Plan a one-time subproject to normalize old reports to the new Testaro-defined shape. After normalization, defensive runtime checks that accommodate historical variation in report structure can be removed.

## How to Apply

When helping with any Kilotest work, assume this migration is the active project. Prefer hand-written types over automated inference to preserve learning value. Each step should be independently mergeable with no degradation of existing behavior.
