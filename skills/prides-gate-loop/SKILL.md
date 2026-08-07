---
name: prides-gate-loop
description: >
  Iteratively runs all PRIDES quality gates for the current phase, fixes failing
  gates, and re-runs until green or a manual gate needs human sign-off. Mirrors a
  review loop. Use when the user wants to "make the gates pass" before advancing a
  PRIDES phase.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Gate Loop

Loop the current phase's quality gates to green.

## Instructions

1. Call `prides_gates` to evaluate every gate for the current phase.
2. For each `fail` gate:
   - Fix the underlying issue (code, config, or missing artifact).
   - Re-run just that gate with `prides_gate <name>`.
3. For each `pending` **manual** gate, request explicit human sign-off; record it with
   `prides_gate <name> --approve` (or `/prides approve <name>`). Do not self-approve.
4. Repeat steps 1–3 until every gate is `pass`, or only manual gates remain pending and signed off.
5. Call `prides_phase_advance` (or `/prides next`) to proceed to the next phase.

## Stop conditions
- A gate keeps failing after a genuine fix attempt → stop and surface the blocker (consider `prides_task_add`).
- A manual gate cannot be signed off → stop and wait for the human; do not force the phase.
- Critical failure → trigger `prides_emergency_stop` and notify the human.
