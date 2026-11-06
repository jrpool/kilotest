---
date: 2026-11-04
status: accepted
---

# Generating duplicated prose and schemas instead of hand-copying them

## Context and problem

`mcp.ts`, `lhm.plugin.json`, `llms.txt`, and `scripts/generate-openapi.ts` each carried their own hand-typed copy of the same sentence describing what Kilotest is (“Kilotest integrates an ensemble of 12 rule engines…”). The four copies had already drifted: `llms.txt` had an accidentally duplicated clause and said “test job” where `lhm.plugin.json` said “test session”, and `generate-openapi.ts`’s `info.description` was a fourth, independently worded variant. Separately, `lhm.plugin.json` hand-transcribes every MCP tool’s `inputSchema`, `outputSchema`, `description`, and `annotations` from `mcp.ts`/`api/schemas.ts`, a step `docs/AI-TOOLS.md` already flagged as “hand-maintained, not generated…transform it…whenever the contract changes.” Regenerating `lhm.plugin.json` from the live registrations in `mcp.ts` found that this hand-transcription had already gone stale: several tool descriptions no longer matched `mcp.ts`, and `listDiagnoses`’s output schema was missing two fields (`identifier of the rule engine` and `how to report that you disagree with this diagnosis`) that the real tool returns.

## Considered options

- Status quo: keep hand-copying prose and schemas into each surface, relying on the `docs/AI-TOOLS.md` “Contract changes” checklist to remind a maintainer to update every copy.
- Add a lint/test check that only flags byte-for-byte differences between the copies, without removing the duplication itself.
- Generate the duplicated surfaces from canonical sources, extending the pattern the project already uses for `package.json`’s `version` (copied into `server.json`/`lhm.plugin.json` by `scripts/update-versions.ts`) and for `api/schemas.ts`/`api/routes.ts` (rendered into `openapi.yaml`/`openapi-3.0.yaml` by `scripts/generate-openapi.ts`).

## Decision

Generate, rather than hand-copy, wherever the same sentence or schema is supposed to appear verbatim in more than one file, extending the project's existing generate-from-canonical-source pattern:

- `content.ts` is the new single source of truth for prose that must be identical across surfaces (`collectionDescription`, the one-line tool-collection description; `sharedContext`, the domain/data-hierarchy paragraph). `mcp.ts` and `scripts/generate-openapi.ts` import it instead of defining their own copies.
- `scripts/generate-lhm.ts` regenerates `lhm.plugin.json`’s top-level `description` and every tool’s `description`, `inputSchema`, `outputSchema`, and `annotations` from `content.ts` and the same tool registrations `mcp.ts` creates at runtime (via `createMCPServer()`) and the same Zod schemas `api/schemas.ts` exports, using `z.toJSONSchema`. Fields with no canonical source elsewhere in the repository (`author`, `cloudEndpoint`, `homepage`, `identifier`, `name`, `prompts`, `resources`, `tags`, `version`, and each tool’s `execution` block) are left untouched by the generator.
- `scripts/generate-lhm.ts` is wired into `npm run generate`, alongside `generate-openapi.ts` and `update-versions.ts`, so `prePR.ts` regenerates it before every release the same way it already regenerates `openapi.yaml`.
- `llms.txt`’s opening paragraph is hand-corrected to match `content.ts`’s `sharedContext` verbatim; it is not generated, because the rest of the file (and `llms-full.txt`, `capability.md`, `README.md`, and the OpenAI-plugin `SKILL.md`) intentionally paraphrase for their audience rather than repeating the same sentence, so forcing byte-identical text there would reduce documentation quality for no benefit. These remain on the existing hand-maintained checklist in `docs/AI-TOOLS.md`.
- Publishing remains separate from generation, as it already was for `openapi.yaml`/`server.json`: `npm run generate` produces correct file content locally, and `npm run publish:lhm` still performs the manual, OAuth-gated push to LobeHub.

The byte-for-byte lint-check option was rejected as a primary strategy because it would still require a maintainer to hand-edit three or four files in sync on every contract change; it only catches drift after the fact rather than removing the duplication that causes it.

### Confirmation

To confirm the correctness of the implementation, run `npm run generate`, verify `lhm.plugin.json`, `openapi.yaml`, and `openapi-3.0.yaml` are unchanged (a clean `git diff`), and run `npm test` and `npm run lint` to confirm nothing else regressed.
