---
date: 2026-09-13
status: accepted
---

# Coverage tool: keep c8, revisit when Node.js experimental coverage stabilizes

## Context and problem

Kilotest enforces 100% line, branch, and statement coverage on the production source files in its test suite. During the TypeScript/ESM migration (step 12), the question arose whether to replace the `c8` coverage tool with Node.js's built-in `--experimental-test-coverage` reporter.

## Considered options

1. **Keep `c8`.**
2. **Switch to Node.js built-in coverage.**

## Decision

**Keep `c8`** for now.

## Rationale

### Why `c8` works

There is exactly one `c8` exclusion in the codebase: the `/* c8 ignore start */` … `/* c8 ignore stop */` block around the import statements at the top of `util.ts`. A comment there explains that `c8` intermittently misreports import lines as uncovered against the installed Node.js version. The exclusion was re-verified empirically during step 12 by temporarily removing it and confirming the failure. It is still necessary.

### Why Node.js built-in coverage does not yet work cleanly

The switch was tested against the full suite. Two problems arose:

1. **`mock.module()` corrupts coverage accounting.** Five test files use `t.mock.module()`. Under `--experimental-test-coverage`, one of them (`web/requestRetest`) reproducibly shows its success-path lines (28–30) as uncovered, despite a passing test that exercises exactly that path. The gap appears only after a later test in the same file runs `import('./index.ts?mockNoExtracts')` alongside `t.mock.module()`. This matches a family of actively-tracked Node.js core bugs where `mock.module()` combined with `--experimental-test-coverage` corrupts coverage accounting (nodejs/node#59112, #61709, #58119). The failure is inconsistent across runs, making it hard to audit or suppress reliably.

2. **Ignore comments do not suppress branch coverage.** The standard `/* node:coverage ignore next [n] */` syntax suppresses line coverage but not branch coverage for the same lines, per nodejs/node#61586. This matters because any exclusion added to work around problem 1 would sit on real, exercised logic (`requestRetest`'s success path), and the standard workaround is documented not to fully apply in exactly that case. So the switch would trade one well-understood, narrowly-scoped exclusion (import lines in `util.ts`) for a new, less predictable one on real logic with a broken workaround.

## Revisit condition

Revisit this decision once `--experimental-test-coverage` stabilizes and the following upstream bugs are resolved:

- nodejs/node#59112, #61709, #58119 — `mock.module()` + coverage accounting
- nodejs/node#61586 — ignore comments do not suppress branch coverage
