---
name: prides-review
description: >
  Run the Review-phase quality gates and a code-review checklist, then require
  human sign-off before advancing. Mirrors a focused PR check. Use when the user
  is in (or entering) the Review phase and wants gates green and the review gate
  signed off.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Review

Make the Review phase auditable and gated.

## Instructions

1. Call `prides_status` to confirm the current phase and open gates/tasks.
2. If not already in Review, advance with `prides_phase_advance` (only after the prior phase's gates pass).
3. Run Review-phase gates with `prides_gates`. For each `fail`, fix and re-run `prides_gate <name>`.
4. The `review` gate is **manual** — it blocks advancement until signed off. Record sign-off with:
   - `prides_gate review --approve` (tool), or
   - `/prides approve review` (command).
5. Do a lightweight code-review pass: surface untested paths, missing docs, and risky diffs; log findings as `prides_artifact` (kind `review-notes`).
6. Only after `prides_gates` shows no `fail` and `review` is signed off, advance with `prides_phase_advance`.

## Why sign-off matters
Manual gates stay `pending` (unsigned) and **block phase advancement** until a human records sign-off. Never self-approve a manual gate without explicit human confirmation.
