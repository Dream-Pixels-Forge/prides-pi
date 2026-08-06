---
name: prides-heartbeat
description: >
  Record PRIDES heartbeat pulses to confirm the agent is healthy and on-intent, and
  interpret HEALTHY / DRIFTING / STALLED status. Use periodically during long phases
  or when the human wants a liveness signal.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Heartbeat

Keep a health signal during the SDLC.

## Instructions

1. During any phase, call `prides_heartbeat` with a short `intent` string describing current work
   (e.g. `prides_heartbeat "fixing auth flake in test-unit"`).
2. Read the returned status:
   - **HEALTHY** — pulse interval within budget for the current phase.
   - **DRIFTING** — gap exceeds the phase interval (slowed down; check blockers).
   - **STALLED** — gap exceeds 2× the phase interval; the agent is considered stuck.
3. If **STALLED**, call `prides_report` to summarize state and recommend next actions, and consider
   `prides_task_add` to capture the blocker.
4. Use `prides_status` to see the latest pulse and whether it is currently STALLED.

## Phase intervals (heartbeat budget)
P 30s · R 2m · I 30s · D 1m · E 5m · S 30s. Criticality: I/D/S are `critical`.
