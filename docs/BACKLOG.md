# Backlog

Engineering tasks and risks that are not yet scheduled.

## Dual-package hazard (testaro-issues)

`index.cjs` and `mcp.cjs` (CommonJS) and the `.ts` source files (ESM) each import `testaro-issues` via their respective build outputs (`.cjs` and `.mjs`). Because `testaro-issues` is read-only static data the two copies are harmless today. If a future dependency with mutable state follows the same dual-format pattern, the two module instances will not share state. Keep this in mind when adding or upgrading dependencies.

## QAI integration

The `jrpool/qai` repository is independent of this `jrpool/kilotest` repository, and they are published as two distict packages. That separation is due to an organizational requirement that no longer exists. Since the QAI application is a tutorial showing users how to use Kilotest, and the tutorial of Kilotest also shows users how to use Kilotest, it is appropriate to convert QAI to a part of the Kilotest codebase. QAI is currently deployed with the URL `https://kilotest.com/qai`, and that would not need to change. `Caddyfile` would be simplified (see the copy in `docs/SERVICE.md`). The QAI code would need to be copied into Kilotest. Any architectural incompatibilities would need to be discovered and resolved. Locally, `qai` is a sibling repository of `kilotest` on this host. Note that QAI health is currently monitored by UptimeRobot, and periodic health monitoring of Kilotest is proposed as the next backlog item after this one, so health monitoring should be handled in such a way that it will be appropriate after both backlog items are completed.

## Implement periodic smoke-test session

Smoke tests validate that the deployed Kilotest service is functioning correctly end-to-end. They were removed from the CI workflow because code changes often require corresponding infrastructure updates (e.g., reverse proxy configuration), and blocking merges on infrastructure drift is counterproductive. Instead, implement a periodic GitHub Actions workflow (similar to UptimeRobot health checks) that runs smoke tests on a schedule (e.g., hourly or daily) against the deployed service. This allows code and infrastructure to be deployed together, then validated by the periodic check independently. The `smokeTest.ts` file remains in the codebase for this purpose.

## Add observability of request metrics

Record per-endpoint request counts, latencies, and error rates so that Kilotest managers can observe which API operations are most used and identify performance regressions.
