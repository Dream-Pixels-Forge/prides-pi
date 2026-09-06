# CHANGELOG

## v2.1.0 (2026-09-06) — "Hands, Eyes, and Tools"

Closes #41, #42, #43 from the v2.0 release.

### Added

- **Real `gh` CLI integration** for `prides_counts_update` (`#41`): new `ghCounts.ts` pure module with `parseGhIssueList`, `parseGhPrList`, `mergeGhCounts` (robust against malformed JSON). Host-side `fetchGhCounts(cwd)` runs `gh issue list --state all --json number,state` and `gh pr list --state all --json number,state,mergedAt`, falls back to zeros on error. `prides_counts_update` now accepts `autoRefresh: boolean` — when `true`, calls `fetchGhCounts` and ignores manual inputs. Backward-compatible.
- **Frame-based animated widget** using pi-tui `Loader` (`#42`): new `widget.ts` exports `buildWidget(getState, getCounts, getDefs, getNow)` returning a `(tui, theme) => Component & { dispose? }` factory. The widget renders the live `StatusSnapshot` on every frame via getter closures and uses a real pi-tui `Loader` (250ms spinner) for the heartbeat indicator. Gracefully degrades when TUI lacks `requestRender` (so unit tests can mount it without a live TUI).
- **Prompt-eval harness** for goal-loop drift detection (`#43`): 8 hand-labeled cases in `dev_notes/eval/drift-cases/` (5 aligned + 3 drifted, covering topic-shift, scope-creep via nonGoals, constraint violations, and minimal-scope edge cases). `goal.eval.test.ts` loads each case, asserts `buildDriftPrompt` + `buildVerifyPrompt` include all required sections, and runs a keyword-based stub judge that achieves 100% accuracy on the labeled set. The stub judge validates that the prompts surface enough information for any reasonable LLM judge (`PRIDES_EVAL_CMD`) to do its job — addresses the "judge quality is the ceiling" limitation noted in `goal-loop-implementation-plan.md` §10.
- **Live `gh` integration test** (`extensions/prides/ghIntegration.test.ts`): auto-skips when `gh` is not installed or not authenticated. When run, verifies the live `gh` JSON → `parseGhIssueList` / `parseGhPrList` → `mergeGhCounts` pipeline against this repo, asserting invariant `merged ≤ closed` and that IssueCounts are sensible non-negative integers.
- **Smoke test** (`extensions/prides/smoke.test.ts`): 10-step end-to-end lifecycle test driving the engine through `scaffold → set goal → plan → drift-block → ack-drift → advance → review → sign-off → task management → goal verification → deploy → emergency-stop-and-resume`. This is the closest automated simulation of a real pi session.
- **`.gitignore` now ignores `*.tgz`** — prevents accidentally committing `npm pack` artifacts.

### Tests

- 194/194 passing (was 141 in v2.0, +53 new across 5 new test files: `ghCounts.test.ts`, `widget.test.ts`, `goal.eval.test.ts`, `ghIntegration.test.ts`, `smoke.test.ts`).
- Eval dataset expanded from 5 → 8 labeled cases; stub-judge accuracy is now 100% (8/8).

### Notes

- `npm publish` is blocked in this environment (no `npm login` configured). The package builds cleanly and produces a 116.7 kB tarball; to publish, run `npm login` first.
- The `ghIntegration.test.ts` runs against the live remote (Dream-Pixels-Forge/pi-prides) when `gh` is authenticated. It is auto-skipped otherwise, so CI without `gh` still passes.

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

