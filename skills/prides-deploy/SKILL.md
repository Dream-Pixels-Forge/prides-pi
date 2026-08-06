---
name: prides-deploy
description: >
  Run the Deploy-phase pre-flight quality gates (deployment checks) and advance
  only when green. Use when the user is deploying or wants to verify deploy
  readiness under PRIDES governance.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Deploy

Verify deploy readiness before shipping.

## Instructions

1. Call `prides_status` to confirm you are in phase **D (Deploy)** and no emergency stop is active.
2. Run `prides_gates` (Deploy phase). The default `deploy-check` gate runs `npm run deploy:check`.
3. For each `fail`, fix the pre-flight issue (env, build, migration, health-check) and re-run `prides_gate deploy-check`.
4. Log the deployment artifact with `prides_artifact` (kind `deploy`, path to the release/log).
5. Only when `prides_gates` shows no `fail`, advance with `prides_phase_advance`.

## Guard note
During Deploy, the PRIDES write guard blocks `write`/`edit` unless `--prides-lax` is set or gates are forced. Use the guard; avoid bypassing it for prod changes.
