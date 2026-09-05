---
name: prides-guard
description: >
  Screen a planned write/edit/bash action against PRIDES policy before
  execution. Returns allow / warn / block with the policy rule(s) that
  triggered, citing phase, emergency-stop state, blocking warnings, and
  failing gates. Use when the agent is about to perform a mutating tool
  call and wants to confirm it is permitted under the current PRIDES
  state.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Guard

Pre-action guardrail screen — consult *before* a destructive tool call.

## When This Skill Activates

- About to call `write`, `edit`, or `bash` for a non-trivial change
- About to commit / push (`git commit`, `git push`, `gh pr create`, `gh pr merge`)
- About to advance phases or set a phase explicitly
- The user asks "is this safe?", "am I allowed to do X?", "will PRIDES block this?"
- Anytime a destructive action is being considered in phases **R**, **D**, or **S**
  (where the default `write`/`edit` guard is active)

## Why a separate skill (not just `prides_status`)

`prides_status` reports raw state. This skill performs **decision logic**: it
takes a *proposed action* and answers "should I do this *right now* under the
current PRIDES state?" The decision is deterministic — given the same state
and the same proposed action, the verdict is identical. That makes it a true
guardrail, not a status dashboard.

## Instructions

### Step 1 — Read the current PRIDES state

```json
prides_status
```

Note: phase, `emergencyStop`, `warnings` (active, blocking), `gates` (failing),
and `git` (branch, step, review status).

### Step 2 — Classify the proposed action

| Action class       | Examples                                         | Phase-allow table |
| ------------------ | ------------------------------------------------ | ----------------- |
| `write`            | `write`, `edit`, file mutation                   | P, R (lax only), I, D (lax only), E, S (lax only) |
| `bash`             | any shell command                                | all phases (but check command body for policy) |
| `git-mutating`     | `git commit`, `git push`, `gh pr create`, `gh pr merge` | any phase, but `prides_warn_list` + `prides_git_status` consulted |
| `phase-advance`    | `prides_phase_advance`, `prides_phase_set`       | any phase; gates must allow |

The default `write`/`edit` guard is active in R, D, and S unless the user
passed `--prides-lax` or `--prides-force`.

### Step 3 — Apply the policy matrix

Walk each rule in order. First match wins.

| Rule                                              | Triggered by                          | Verdict |
| ------------------------------------------------- | ------------------------------------- | ------- |
| Emergency stop active                             | `state.emergencyStop === true`        | **block** |
| Active error-severity warning blocks git ops      | `warnings[].severity === "error"` AND action is `git-mutating` | **block** |
| Active warn-severity warning blocks git ops       | `warnings[].severity === "warn"` AND action is `git-mutating`  | **block** |
| Manual gate is pending on current phase            | `state.gates[name].status === "pending"` AND action is `phase-advance` | **block** |
| Failing gate on current phase                     | `state.gates[name].status === "fail"` AND action is `phase-advance`  | **block** |
| Write in protected phase (R, D, S) without `--prides-lax` | action is `write` AND `state.phase` ∈ {R, D, S} | **block** |
| Non-conformant branch + git-mutating action       | `state.git.branchType` undefined AND action is `git-mutating`     | **warn**  |
| Everything else                                   | —                                     | **allow** |

### Step 4 — Output the verdict

A deterministic 3-tuple: `verdict`, `rule`, `reasoning`.

```
verdict:  allow | warn | block
rule:     <rule-name-that-fired>  (or "none")
reasoning: <one-sentence explanation citing the rule + the state value>
```

Example outputs:

```
allow   | none             | "write in phase I (Implement); no blocking conditions"
block   | emergency-stop   | "emergencyStop=true; resolve via prides_emergency_resume first"
block   | write-guard-r    | "phase R has write/edit guard active; pass --prides-lax or wait for phase I"
warn    | non-conformant-branch | "branch 'foo' does not follow PRIDES taxonomy (feature/*|hotfix/*|bug/*|release/*|chore/*)"
```

### Step 5 — On `block`: surface the remediation

For each `block` verdict, name the smallest unblocking action:

| Verdict rule              | Remediation                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `emergency-stop`          | `prides_emergency_resume` (after human review of the reason)             |
| `*-warning-blocks-git`    | `prides_warn_list` → fix → `prides_warn_resolve <id>`                    |
| `*-gate-fails`            | `prides_gate <name>` to re-evaluate, or fix the underlying issue         |
| `manual-gate-pending`     | `prides_gate <name> approve=true` (human sign-off)                       |
| `write-guard-r/d/s`       | `prides_phase_advance` (if all gates pass) or wait                       |

## Verification Before Mutating

Always re-check immediately before the destructive tool call, not at planning
time — PRIDES state can change between plan and execution (a gate can fail,
the user can hit emergency stop, a warning can be raised by another tool).

## Routing

- Multi-phase write workflow → still defer to `prides-orchestrate` for routing,
  but use this skill for each individual mutating tool call.
- Security audit / emergency → defer to `prides-secure` or `prides-cybersec`.
- Goal-alignment questions → defer to `prides_goal_check` / `prides_goal_verify`,
  not this skill.

## What this skill does NOT do

- It does not *execute* the action — only screens it.
- It does not bypass `--prides-guard` / `--prides-lax` / `--prides-force`
  flags. Those are the user's call.
- It does not replace the host runtime's `write` / `edit` / `bash` tool
  guards — those run independently as a second line of defense.
