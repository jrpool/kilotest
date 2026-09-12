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
7. Rely on the `Report` interface defined at `https://github.com/YRA-Tech/testaro/blob/main/types.ts` to complete the migration of code that makes less specific assumptions about the shape of Testaro reports. This includes (A) converting nonconforming reports to the expected shape, and (B) updating code that accesses report properties to use the expected shape.
8. Discover and utilize remaining opportunities for type enforcements, concern separations, and simplifying refactors.
9. Review all instances of exclusions from `c8` coverage reporting to ensure they are still necessary, and also decide whether to abandon `c8` in favor af the `node` built-in experimental coverage reporter.

## How to Apply

When helping with any Kilotest work, assume this migration is the active project. Prefer hand-written types over automated inference to preserve learning value. Each step should be independently mergeable with no degradation of existing behavior.

## Later work

- Add observability of request metrics.
- Investigate a dual-package hazard in the imports from `testaro-issues`. Statement by SWE-2 about this: “The dual-package hazard will bite again in the other direction once index.cjs/mcp.cjs (still CommonJS, using the .cjs build) and the converted .ts modules (using the .mjs build) hold separate copies of its state. Harmless here since testaro-issues is read-only static data, but the pattern matters if a dual-format dependency ever carries mutable state.”
