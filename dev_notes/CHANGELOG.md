# CHANGELOG

## v2.0.0 (2026-09-05) — "Hands and Eyes"

Major release: PRIDES transforms from a passive governance layer into an active pipeline driver.

### Added

- **Animated, structured widget** (`updateWidget`): drives an updated render function that surfaces the phase progress bar (`P → R → [I] → D → E → S`), task open/total, gate pass/fail/pending counts, heartbeat age, goal drift score + severity, warnings active count, blocking gate names, GitHub-style issues/PRs counts, and emergency-stop indicator.
- **Enriched `prides_status`** — now accepts `format: "text" | "json"` and returns a structured `StatusSnapshot` (phase index/total, gate counts, task counts, heartbeat age, drift score, warnings, GitHub-style counts).
- **`prides_counts_update`** — writes `.prides/counts.json` with `issuesOpened/Closed` and `prsOpened/Closed/Merged`. Use after `gh` CLI fetches.
- **Drift enforcement** — `prides_drift_ack` tool, `driftAck` state field, `checkDriftBlock` helper. Unacknowledged active goal-drift warning now blocks `prides_phase_advance` (override with `force=true`).
- **`prides_plan`** — generates a goal-enforced phase-by-phase implementation plan and writes it to `dev_notes/PLAN_AUTO.md`. Re-call after every goal or task-list change.
- **`prides_orchestrate_handoff`** — returns a deterministic skill-routing map (primary skill, rationale, cross-references to `pipeline-orchestrator`, `dpf-agentic-engineer`, `test-driven-development`, `subagent-driven-development`, `loopy-agent`, `dpf-debugger-engineer`, `prides-guard`, `pipeline-scorer`, `karpathy-guidelines`, `cybersecurity`, `driftGuard`).
- **`prides_drive`** (autonomous next-step) — `nextAction(state, defs)` returns a deterministic recommendation: `scaffold | set_goal | plan | heartbeat | task_done | run_gates | acknowledge_drift | verify_goal | advance | complete | emergency_resume`. Never auto-executes — user must opt-in per call.
- **`prides-guard` skill** — pre-action guardrail screen (allow / warn / block) with a policy matrix covering emergency stop, blocking warnings, failing gates, manual-gate sign-off, write-guarded phases, and non-conformant branches.
- **`driftGuard` cross-reference** in orchestrator skill — the dedicated drift module for handling drift detection and acknowledgment.

### Changed

- Widget now driven by the same `StatusSnapshot` that powers `prides_status` — single source of truth.
- `prides_status` tool is backward-compatible (default `format="text"` preserves original lines).
- `prides-orchestrate` skill explicitly cross-references `pipeline-orchestrator`, `dpf-agentic-engineer`, `test-driven-development`, `subagent-driven-development`, `loopy-agent`, and other agentic-workflow skills — closes the integration gap from `AGENTIC_2026_REVIEW.md` §3.B.
- `canAdvance()` now enforces drift acknowledgment as well as goal verification.

### Tests

- 141/141 passing (was 93 before this release).
- New test files: `status.test.ts` (10), `driftGuard.test.ts` (6), `plan.test.ts` (9), `handoff.test.ts` (11), `drive.test.ts` (12).
- All 93 pre-existing tests preserved; no behavior changes to existing tool signatures.

### Backwards compatibility

- All existing tool signatures unchanged. New tools are purely additive.
- `prides_status` default behavior is identical (text output via `widgetLines`).
- `prides_goal_set/check/verify`, `prides_task_add/done/list`, `prides_phase_advance/set`, `prides_gate(s)`, `prides_heartbeat`, `prides_emergency_stop/resume`, `prides_artifact`, `prides_scaffold`, `prides_report`, `prides_git_*`, `prides_warn*` — all unchanged.

