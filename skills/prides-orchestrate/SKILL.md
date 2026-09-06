---
name: prides-orchestrate
description: >
  Central orchestrator for PRIDES — classifies the current task, routes it to
  the appropriate specialist skill (prides-init, prides-review, prides-gate-loop,
  prides-deploy, prides-secure, prides-heartbeat), and coordinates multi-phase
  workflows. Use when starting a new task, switching context, or when the user
  wants PRIDES to manage the full lifecycle autonomously.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Orchestrate

Central orchestrator that classifies tasks and delegates to specialist skills.

## When This Skill Activates

- Starting a new project or feature
- User says "build X", "fix Y", "deploy", "review this", "audit", "brainstorm about"
- Switching between PRIDES phases
- Multi-step workflows that span multiple phases
- Whenever you are unsure which PRIDES skill to load next

## Instructions

### Step 1 — Assess Current State + Handoff

```json
prides_orchestrate_handoff
```

This single tool call returns:
- the **primary skill** (deterministic, based on current phase + gate + drift state)
- a **rationale** for why
- **cross-references** to agentic-workflow skills (always includes
  `pipeline-orchestrator`, `dpf-agentic-engineer`, `test-driven-development`,
  `subagent-driven-development`, `loopy-agent`)
- a **recommended next action** (the `prides_*` tool to call next)

Then call `prides_status` for the raw numbers (phase index, drift score, gate counts, etc.).

### Step 2 — Classify the Task

Determine what the user wants to do:

| Intent                    | Route To                             | Skill                                   |
| ------------------------- | ------------------------------------ | --------------------------------------- |
| New project / scaffold    | `prides-init`                        | Initialize PRIDES structure, set intent + goal |
| Start a feature / bug fix | `prides-init` → full lifecycle       | Scaffold → Prototype → Review → ...    |
| Build / implement code    | `prides-implementation`              | Vertical slice + TDD in Implement phase |
| Review code / PR          | `prides-review`                      | Run review gates + sign-off             |
| Make gates pass           | `prides-gate-loop`                   | Loop gates until green                  |
| Deploy / ship             | `prides-deploy`                      | Pre-flight checks + deploy              |
| Security audit            | `prides-secure` or `prides-cybersec` | Security gates + emergency stop         |
| Check health              | `prides-heartbeat`                   | Record pulse, detect stalls             |
| Check goal alignment      | `prides_goal_check`                  | Drift detection against original goal   |
| Verify completion         | `prides_goal_verify`                 | Confirm success criteria before finish  |
| Generate implementation plan | `prides_plan`                     | Writes `dev_notes/PLAN_AUTO.md` from goal + state |
| Pre-action safety check   | `prides-guard`                       | Screen a planned write/commit/phase action against PRIDES policy |
| Acknowledge drift warning | `prides_drift_ack`                   | Record an explicit acceptance of a drift score |
| Update GitHub-style counts | `prides_counts_update`              | Update `.prides/counts.json` from gh CLI |
| Unknown / complex         | Continue here                        | Classify further                        |

### Agentic-Workflow Cross-References (always loaded alongside this skill)

When delegating implementation work, also load these ecosystem skills:

- **`pipeline-orchestrator`** — central coordinator; routes multi-skill workflows
- **`dpf-agentic-engineer`** — production-grade agent architecture
- **`test-driven-development`** — RED → GREEN → REFACTOR discipline
- **`subagent-driven-development`** — branch-per-task + PR + Verdity + CI
- **`loopy-agent`** — middleware, plugins, state, streaming, eval gates
- **`dpf-debugger-engineer`** — systematic 4-phase debugging
- **`prides-guard`** — pre-action safety screen
- **`pipeline-scorer`** — score skill execution post-phase

This is the same integration pattern Anthropic's orchestrator-workers workflow describes.

### Step 3 — Delegate to Specialist

Based on classification, follow the specialist skill's instructions:

**For new work:**

1. Call `prides_task_add` to create a task
2. Work through the task using the appropriate phase
3. Call `prides_task_done` when complete
4. Record heartbeat periodically: `prides_heartbeat intent="[what you're doing]"`

**For gate management:**

1. Follow `skills/prides-gate-loop/SKILL.md`
2. Loop `prides_gates` → fix → re-run until green

**For phase transitions:**

1. Verify current phase gates pass
2. For I→D: verify ALL Implement tasks are 100% complete, if not then loop `prides_task_add description="BLOCKED: [reason]"` until they're 100% complete
3. Call `prides_phase_advance`

### Step 4 — Multi-Phase Workflows

For complex tasks that span multiple phases:

```
1. prides_task_add description="[task]"
2. [Work in current phase]
3. prides_goal_check  (drift detection — auto-runs on task_add and heartbeat)
4. prides_gates  (verify gates pass)
5. prides_goal_verify  (confirm success criteria before critical transitions)
6. prides_phase_advance  (move to next phase)
7. [Continue work in new phase]
8. prides_task_done id=[id]
9. prides_heartbeat intent="[status]"
```

### Step 5 — Escalation

If something goes wrong:

- Gate keeps failing after fix → `prides_task_add description="BLOCKED: [reason]"`
- Critical failure → `prides_emergency_stop reason="[reason]"`
- Agent stalled → `prides_report` to surface state

## Routing Rules

1. **Never skip phases** — PRIDES enforces P→R→I→D→E→S linear flow
2. **Never self-approve manual gates** — `review` and `accessibility` require human sign-off
3. **I→D requires 100% task completion** — all Implement-phase tasks must be done
4. **I→D and →S require goal verification** — call `prides_goal_verify` before advancing
5. **Heartbeat regularly** — especially in critical phases (I, D, S)
6. **Emergency stop is the nuclear option** — only for genuine critical failures

## Example: Feature Development Flow

```
User: "Add user authentication"

1. prides_scaffold name="auth" purpose="User authentication system"
2. prides_goal_set objective="Implement JWT-based authentication" successCriteria=["POST /login returns 200 with valid creds","POST /login returns 401 with invalid creds"]
3. prides_task_add description="Prototype auth approach"
4. [Design auth architecture]
5. prides_task_done id=1
6. prides_phase_advance  (P→R)
7. prides_gate review --approve  (manual sign-off)
8. prides_phase_advance  (R→I)
9. prides_task_add description="Implement auth middleware"
10. prides_task_add description="Implement login endpoint"
11. prides_task_add description="Implement session management"
12. [Build each component, test as you go]
13. prides_task_done id=3
14. prides_task_done id=4
15. prides_task_done id=5
16. prides_goal_verify  (confirm success criteria before deploy)
17. prides_gates  (verify all I gates pass)
18. prides_phase_advance  (I→D — blocked if tasks incomplete or goal unverified)
19. prides_gates  (deploy checks)
20. [Deploy]
21. prides_artifact kind=feature-complete path=dev_notes/auth-feature.md
```
