# Goal Loop for pi-prides — Implementation Plan

**Target repo:** `Dream-Pixels-Forge/pi-prides`
**Goal:** close the loop between the original project intent and ongoing agent
activity, so the agent can be pulled back on-track mid-session and can prove,
before finishing, that it actually did what was asked — not just that gates
passed and phases advanced.

**Why this is needed (confirmed from source):**
- `ProjectIntent` (`types.ts:88`) is write-once. `prides_scaffold` sets it via
  `engine.ts:103 setIntent()`; nothing ever reads it back afterward.
- `HeartbeatStatus.DRIFTING` (`types.ts:78`) is purely time-based —
  `heartbeat.ts:28 classifyPulse()` only compares elapsed time to the phase
  interval. It has no concept of *what* the agent is doing.
- `prides-orchestrate` skill is a prompt, not an enforced mechanism — nothing
  forces the agent to re-check itself against the original goal as context
  grows or compacts.
- An `eval` gate type and injected `Judge` already exist and work
  (`gates.ts:114`, wired in `index.ts:130 makeJudge()` via `PRIDES_EVAL_CMD`)
  but are never used for goal-checking today. This plan reuses that plumbing.

---

## 0. Scope & non-goals

**In scope:** a `GoalSpec` data model, a pure `goal.ts` module, three new
tools, drift detection piggybacked on the existing heartbeat cadence, a
final verification gate before "done," and wiring into `phases.ts` /
`engine.ts` / `index.ts`.

**Out of scope:** replacing the judge implementation itself, new persistence
mechanisms (reuse session persistence already in place), forcing tool calls
(no such mechanism exists in `pi`; this plan works within that constraint by
attaching to heartbeat, which is already semi-mandatory in critical phases).

---

## 1. Data model changes — `types.ts`

Add after `ProjectIntent`:

```typescript
export interface GoalSpec {
  objective: string;          // one-sentence definition of "done"
  successCriteria: string[];  // checkable, e.g. "auth middleware rejects invalid JWT"
  nonGoals?: string[];        // explicit out-of-scope — prevents scope creep
  constraints?: string[];     // e.g. "no new dependencies", "do not touch billing/"
  setAt: number;
}

export type GoalCheckKind = "drift" | "verify";

export interface GoalCheckResult {
  kind: GoalCheckKind;
  aligned: boolean;
  driftScore: number;              // 0 (on track) – 1 (fully off track)
  reasoning: string;
  unmetCriteria?: string[];        // populated for kind: "verify"
  suggestedCorrection?: string;
  checkedAt: number;
}
```

Extend `PRIDESState`:

```typescript
export interface PRIDESState {
  // ...existing fields...
  goal?: GoalSpec;
  goalChecks: GoalCheckResult[];   // capped, same pattern as `events`
}
```

Add new `AuditKind` values: `"goal_set" | "goal_check" | "goal_verify"`.

**Files touched:** `types.ts`
**Effort:** ~30 min

---

## 2. Pure module — `goal.ts`

New file, same shape as `heartbeat.ts` (smallest existing module — good
template). No filesystem, no host API, no global time — clock and judge are
injected, matching `EngineDeps`.

```typescript
import type { Clock, GoalCheckResult, GoalSpec, Judge, PRIDESState } from "./types.js";

const MAX_GOAL_CHECKS = 50;
const DRIFT_WARN_THRESHOLD = 0.5;
const DRIFT_STOP_THRESHOLD = 0.85;
const ACTIVITY_WINDOW_MS = 15 * 60 * 1000; // last 15 min of activity feeds the judge

/** Pull recent heartbeats/tasks/artifacts into a compact text block for the judge. */
export function summarizeRecentActivity(
  state: PRIDESState,
  now: number,
  windowMs: number = ACTIVITY_WINDOW_MS,
): string {
  const cutoff = now - windowMs;
  const recentEvents = state.events.filter((e) => e.at >= cutoff);
  const lines = recentEvents.map((e) => `[${e.kind}] ${e.message}`);
  if (state.heartbeat) lines.push(`[heartbeat] intent: ${state.heartbeat.intent}`);
  return lines.length ? lines.join("\n") : "(no recent activity recorded)";
}

export function buildDriftPrompt(goal: GoalSpec, recentActivity: string): string {
  return [
    `Original objective: ${goal.objective}`,
    `Success criteria: ${goal.successCriteria.join("; ")}`,
    goal.nonGoals?.length ? `Non-goals (explicitly out of scope): ${goal.nonGoals.join("; ")}` : "",
    goal.constraints?.length ? `Constraints: ${goal.constraints.join("; ")}` : "",
    "",
    "Recent agent activity:",
    recentActivity,
    "",
    "Is the agent still working toward the original objective, or has it drifted",
    "into unrelated or unscoped work? Respond with: aligned (yes/no), a drift",
    "score from 0 (on track) to 1 (fully off track), one-sentence reasoning, and",
    "a one-sentence correction if drifted.",
  ].filter(Boolean).join("\n");
}

export function buildVerifyPrompt(goal: GoalSpec, recentActivity: string): string {
  return [
    `Original objective: ${goal.objective}`,
    `Success criteria (check each one):`,
    ...goal.successCriteria.map((c) => `- ${c}`),
    "",
    "Evidence of work done (tasks, artifacts, gate results):",
    recentActivity,
    "",
    "For each success criterion, has it actually been satisfied by the recorded",
    "evidence? List any UNMET criteria explicitly. Respond with: aligned (yes",
    "only if ALL criteria are met), drift score, reasoning, and unmet criteria.",
  ].join("\n");
}

/** Parse the judge's free-text verdict into a GoalCheckResult. Defensive: judge output is untrusted text. */
export function parseGoalVerdict(
  kind: GoalCheckResult["kind"],
  raw: { status: string; message: string; score?: number },
  now: Clock,
): GoalCheckResult {
  const aligned = raw.status === "pass";
  return {
    kind,
    aligned,
    driftScore: typeof raw.score === "number" ? raw.score : aligned ? 0 : 1,
    reasoning: raw.message,
    checkedAt: now(),
  };
}

export function recordGoalCheck(state: PRIDESState, result: GoalCheckResult): PRIDESState {
  const goalChecks = [...state.goalChecks, result].slice(-MAX_GOAL_CHECKS);
  return { ...state, goalChecks };
}

export function lastGoalCheck(state: PRIDESState): GoalCheckResult | null {
  return state.goalChecks.length ? state.goalChecks[state.goalChecks.length - 1] : null;
}

export function driftSeverity(score: number): "ok" | "warn" | "stop" {
  if (score >= DRIFT_STOP_THRESHOLD) return "stop";
  if (score >= DRIFT_WARN_THRESHOLD) return "warn";
  return "ok";
}

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // never judge-check more than once per 5 min

/**
 * Throttle gate for drift checks. A judge call costs real latency/money, so
 * this is deliberately decoupled from heartbeat frequency (which can be as
 * tight as 30s in critical phases) — see §7 for why.
 */
export function shouldRunDriftCheck(state: PRIDESState, now: number): boolean {
  if (!state.goal) return false;
  const last = lastGoalCheck(state);
  if (!last) return true; // never checked yet — always check once early
  return now - last.checkedAt >= MIN_CHECK_INTERVAL_MS;
}
```

**Files added:** `goal.ts`
**Effort:** ~1.5–2 hrs including edge-case handling (no goal set, judge unconfigured)

---

## 3. Tests — `goal.test.ts`

Follow the existing pattern in `heartbeat.test.ts` (injected clock, no
mocking libraries needed since everything is pure functions on plain data).

Cases to cover:
1. `summarizeRecentActivity` — respects window cutoff, empty-state fallback
2. `buildDriftPrompt` / `buildVerifyPrompt` — omits empty optional sections cleanly
3. `parseGoalVerdict` — maps judge pass/fail correctly, defaults score when judge omits it
4. `recordGoalCheck` — caps at `MAX_GOAL_CHECKS`, append-only like `recordEvent`
5. `driftSeverity` — boundary values at 0.5 and 0.85
6. `shouldRunDriftCheck` — false with no goal, true on first-ever check, false
   within cooldown window, true once cooldown elapses

**Files added:** `goal.test.ts`
**Effort:** ~1 hr

---

## 4. Engine wiring — `engine.ts`

Add three methods to `PRIDESEngine`, mirroring how `heartbeat()` and
`runGate()` are already structured (both already have access to
`this.deps.judge`, `this.deps.now`, `this.state`):

```typescript
setGoal(goal: Omit<GoalSpec, "setAt">): OpResult {
  const full: GoalSpec = { ...goal, setAt: this.deps.now() };
  this.state = { ...this.state, goal: full };
  this.state = recordEvent(this.state, {
    kind: "goal_set", phase: this.state.phase, message: `Goal set: ${goal.objective}`,
  });
  return { ok: true, message: `Goal set: ${goal.objective}` };
}

async checkGoalDrift(): Promise<GoalCheckResult | OpResult> {
  if (!this.state.goal) return { ok: false, message: "No goal set — call prides_goal_set first" };
  const activity = summarizeRecentActivity(this.state, this.deps.now());
  const prompt = buildDriftPrompt(this.state.goal, activity);
  const verdict = await this.deps.judge(prompt, { cwd: this.deps.cwd });
  const result = parseGoalVerdict("drift", verdict, this.deps.now);
  this.state = recordGoalCheck(this.state, result);
  this.state = recordEvent(this.state, {
    kind: "goal_check", phase: this.state.phase,
    message: `Drift check: aligned=${result.aligned} score=${result.driftScore}`,
  });
  return result;
}

async verifyGoal(): Promise<GoalCheckResult | OpResult> {
  if (!this.state.goal) return { ok: false, message: "No goal set — call prides_goal_set first" };
  const activity = summarizeRecentActivity(this.state, this.deps.now(), 24 * 60 * 60 * 1000); // full session
  const prompt = buildVerifyPrompt(this.state.goal, activity);
  const verdict = await this.deps.judge(prompt, { cwd: this.deps.cwd });
  const result = parseGoalVerdict("verify", verdict, this.deps.now);
  this.state = recordGoalCheck(this.state, result);
  this.state = recordEvent(this.state, {
    kind: "goal_verify", phase: this.state.phase,
    message: `Goal verify: aligned=${result.aligned}`,
  });
  return result;
}
```

**Auto-escalation** (inside `checkGoalDrift`, after recording the result):

```typescript
const severity = driftSeverity(result.driftScore);
if (severity === "warn") {
  this.state = addWarning(this.state, {
    severity: "warn", category: "goal-drift",
    message: result.suggestedCorrection ?? result.reasoning,
  }, this.deps.now);
} else if (severity === "stop") {
  // reuse the exact emergencyStop path already used for critical gate failures
  this.state = { ...this.state, emergencyStop: true };
  this.state = recordEvent(this.state, {
    kind: "emergency_stop", phase: this.state.phase,
    message: `Auto-stop: severe goal drift (${result.driftScore}) — ${result.reasoning}`,
  });
}
```

*(Check exact `addWarning` signature/location in `engine.ts` before wiring —
warnings are already a first-class concept per `PRIDESWarning` in `types.ts`,
so this should be a call to the existing helper, not a new one.)*

**Files touched:** `engine.ts`
**Effort:** ~2 hrs (including matching existing warning/emergency-stop helpers exactly)

---

## 5. Phase-gating — `phases.ts`

Today, `canAdvance()` checks gate status per phase. Add a goal check
alongside it, same call site, same `force` escape hatch already used
elsewhere in this file:

```typescript
export function canAdvance(
  state: PRIDESState,
  gates: GateDef[],
  results: Record<string, GateResult>,
  force = false,
): { ok: boolean; reason?: string } {
  // ...existing gate checks...

  // NEW: goal gating — require alignment before entering S, and before I->D
  if (!force && state.goal) {
    const last = lastGoalCheck(state);
    const enteringCritical =
      (state.phase === "I" && nextPhase(state.phase) === "D") ||
      nextPhase(state.phase) === "S";
    if (enteringCritical && (!last || last.kind !== "verify" || !last.aligned)) {
      return { ok: false, reason: "Goal not verified — call prides_goal_verify before advancing" };
    }
  }
  return { ok: true };
}
```

This mirrors the existing "I→D requires 100% task completion" rule
documented in the `prides-orchestrate` skill (`SKILL.md:71`) — same
enforcement pattern, new condition.

**Files touched:** `phases.ts`, `phases.test.ts` (add cases: blocked without
verify, blocked with unaligned verify, passes with aligned verify, force
bypasses)
**Effort:** ~1.5 hrs

---

## 6. Tool registration — `index.ts`

Register three tools following the exact pattern already used for
`prides_heartbeat` (`index.ts:750`) and `prides_gate` (`index.ts:603`):

| Tool | Input | Behavior |
|---|---|---|
| `prides_goal_set` | `objective: string, successCriteria: string[], nonGoals?: string[], constraints?: string[]` | Calls `engine.setGoal()`. Should be called once, right after `prides_scaffold`, ideally *by* the init flow so it isn't optional. |
| `prides_goal_check` | *(none)* | Calls `engine.checkGoalDrift()`. This is the one to piggyback onto `prides_heartbeat` — see §7. |
| `prides_goal_verify` | *(none)* | Calls `engine.verifyGoal()`. Required before `I→D` / `→S` per §5. |

Also add to `prides_status` and `prides_report` output: surface
`state.goal?.objective` and the last `GoalCheckResult` (aligned/score/age),
next to the existing phase/gate/heartbeat summary — no new report format,
just append a section.

Update the `/prides` slash command (`index.ts:~1361`) help text and add:
```
/prides goal set <objective>          # set the project goal
/prides goal check                    # run a drift check now
/prides goal verify                   # verify all success criteria before finishing
```

**Files touched:** `index.ts`
**Effort:** ~2 hrs

---

## 7. Trigger design: task-events primary, heartbeat as throttled fallback

**Heartbeat alone is the wrong primary trigger.** Firing a judge call on
every pulse means up to 120 calls/hour in Implement/Secure (30s interval) —
real latency and cost for a check that's mostly "yes, still aligned," since
drift doesn't happen in 30-second increments. It's also backwards for the
Extend phase: Extend has the *loosest* heartbeat interval (5 min) but is
arguably the phase most prone to scope creep, so the phase most likely to
drift would get checked least often under a pure heartbeat trigger.

**Drift is a semantic event, not a time-based one.** It happens at the
moment the agent makes a scope decision — most concretely, when it adds a
new task. So `prides_task_add` becomes the primary trigger, with heartbeat
kept only as a *fallback carrier* (via the `shouldRunDriftCheck` throttle
from §2) so a long stretch of silent work still eventually gets checked.

**7a. Primary trigger — on task add** (`index.ts`, `prides_task_add` handler):

```typescript
const result = e.addTask(params.description);
if (e.state.goal && shouldRunDriftCheck(e.state, this.deps.now())) {
  const check = await e.checkGoalDrift();
  if ("aligned" in check && !check.aligned) {
    return {
      content: [{
        type: "text",
        text: `Task added.\n⚠ Goal drift detected (${check.driftScore}): ${check.reasoning}`,
      }],
    };
  }
}
```

This is the moment scope decisions actually happen, so it's a far better
signal than "N seconds elapsed" — and it naturally fires more often in
scope-creep-prone phases (Extend generates lots of task adds) and less
often in tight execution loops that aren't adding new work.

**7b. Fallback trigger — on heartbeat, throttled** (`index.ts`,
`prides_heartbeat` handler, `index.ts:750`):

```typescript
const pulse = e.heartbeat(params.intent);
let goalNote = "";
if (e.state.goal && shouldRunDriftCheck(e.state, this.deps.now())) {
  const check = await e.checkGoalDrift();
  if ("aligned" in check && !check.aligned) {
    goalNote = `\n⚠ Goal drift detected (${check.driftScore}): ${check.reasoning}`;
  }
}
return { content: [{ type: "text", text: `Heartbeat recorded${goalNote}` }] };
```

Because both handlers call the same `shouldRunDriftCheck` gate against the
*same* `state.goalChecks` history, whichever fires first (a task add or a
heartbeat) resets the 5-minute cooldown for the other — so you never
double-pay for a check that just happened. This is the actual mechanism
that "helps start a project from start to finish without drifting": a
scope-decision trigger for precision, a time-throttled fallback for
coverage, and a shared cooldown so cost stays bounded regardless of how
chatty the agent is with either tool.

**Files touched:** `index.ts`
**Effort:** ~1.5 hr (slightly more than the original single-hook version,
since two call sites now share the throttle state)

---

## 8. Scaffold + skill updates

- `scaffold.ts`: extend `.prides/intent.json` output to also write
  `.prides/goal.json` (or fold `GoalSpec` into the same file) so the goal is
  visible/editable as a plain file, consistent with how intent already works.
- `skills/prides-init/SKILL.md`: add a step requiring `prides_goal_set` be
  called immediately after `prides_scaffold`, with guidance on writing good
  `successCriteria` (checkable, not vague — "auth works" is bad,
  "POST /login returns 200 with valid creds and 401 otherwise" is good).
- `skills/prides-orchestrate/SKILL.md`: add `prides_goal_check` /
  `prides_goal_verify` to the routing table and the "Multi-Phase Workflows"
  example sequence in §4 of the existing skill.

**Files touched:** `scaffold.ts`, `scaffold.test.ts`, two `SKILL.md` files
**Effort:** ~1.5 hrs

---

## 9. Rollout order & effort summary

| Step | Files | Effort | Depends on |
|---|---|---|---|
| 1. Types | `types.ts` | 0.5 hr | — |
| 2. Pure module | `goal.ts` | 1.5–2 hr | 1 |
| 3. Unit tests | `goal.test.ts` | 1 hr | 2 |
| 4. Engine methods | `engine.ts` | 2 hr | 2 |
| 5. Phase gating | `phases.ts`, `phases.test.ts` | 1.5 hr | 4 |
| 6. Tools | `index.ts` | 2 hr | 4 |
| 7. Task-add trigger + heartbeat fallback (throttled) | `index.ts` | 1.5 hr | 6 |
| 8. Scaffold + skills | `scaffold.ts`, `SKILL.md`s | 1.5 hr | 6 |

**Total: ~11.5–12.5 hours** of focused implementation + review, doable as one
PR given the codebase's small module sizes, or split as: **PR1** = steps
1–3 (pure core, fully tested, no host wiring — lowest risk), **PR2** = steps
4–8 (engine + tool + skill wiring).

---

## 10. Validation before merging

1. `npm run check` (existing `typecheck + lint + test`) must stay green —
   this project is strictly TDD per the README, so `goal.ts` needs its tests
   written first or alongside, not after.
2. Manually eval-test the drift/verify prompts against a few real
   `PRIDES_EVAL_CMD` judges before trusting them to gate `I→D` — a weak
   judge will rubber-stamp `aligned: yes` the same way a weak human reviewer
   does. Recommend a short prompt-eval harness (5–10 hand-labeled
   drifted/non-drifted transcripts) as a pre-merge check, not just unit tests
   of the parsing logic.
3. Confirm the `force` flag still fully bypasses goal gating (matches
   existing `--prides-force` behavior for gates), so the feature never traps
   a legitimate user who disagrees with the judge.

---

## Known limitations to flag to users of this feature

- Still voluntary at the tool-call level outside of `prides_task_add` and
  `prides_heartbeat` — an agent that calls neither in a stretch of critical-
  phase work never gets drift-checked. Staleness detection (`isStalled`)
  already nags for exactly this reason on the heartbeat side, so the
  incentive to at least heartbeat regularly already exists; there's no
  equivalent nag for "you haven't added a task in a while," which is worth
  considering as a follow-up if task-add turns out to be too sparse a signal
  in practice.
- Judge quality is the ceiling. This plan makes goal-checking *structurally
  possible*; it doesn't make the check itself smart. Document this clearly
  in the skill so users don't over-trust a misconfigured judge.
