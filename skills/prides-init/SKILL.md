---
name: prides-init
description: >
  Scaffold a new or existing project for the PRIDES lifecycle. Creates
  .prides/, intent.json, and dev_notes/ (TASKS, PROGRESS, CHANGELOG, ARCHITECTURE),
  records the project intent, and reports the starting phase. Use at the very
  start of a project, or to (re)initialize PRIDES tracking on an existing repo.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Init

Bootstrap PRIDES tracking for a project.

## Instructions

1. Gather intent: project `name`, one-line `purpose`, optional `stack` and `repository`.
2. Call `prides_scaffold` with those fields. It writes:
   - `.prides/intent.json`
   - `.prides/gates.config.json`
   - `dev_notes/TASKS.md`, `dev_notes/PROGRESS.md`, `dev_notes/CHANGELOG.md`, `dev_notes/ARCHITECTURE.md`
   - `PRIDES.md`
3. Call `prides_status` to confirm the engine is in phase **P (Prototype)**.
4. If this is an existing project, run `prides_report` to surface current gate/task/heartbeat state before planning work.

## Notes
- `prides_scaffold` also stamps the project intent; you can update it later via `prides_status` detail or re-scaffold.
- Customize gates per project by editing `.prides/gates.config.json` (see `prides_gates`).
