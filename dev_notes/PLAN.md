# PLAN — PRIDES × Agentic Workflow Fit Analysis & "Next Level" Skills

- **Author:** pi-prides review
- **Date:** 2026-07-14
- **Scope:** Depth-search the current agentic workflow encoded in this repo, compare it
  against the PRIDES pi-extension framework, decide what to adjust, and evaluate
  `github.com/greptileai/skills` as a model for first-class PRIDES skills.

---

## 1. Objective

1. Inventory the *current* agentic workflow content in this repo (`agents/`, `prompts/`, `skills/`, `src/`).
2. Determine whether that workflow **fits** the PRIDES pi-extension framework (runtime + API compatibility).
3. List concrete **adjustments** required so content and framework are coherent.
4. Use `greptileai/skills` as a reference to design **pi-native PRIDES skills** for the next level.

---

## 2. Depth-search findings — current agentic workflow inventory

| Path | Format | Runtime target | Wired into pi? |
|------|--------|----------------|----------------|
| `src/index.ts` (+ `engine.ts` etc.) | TypeScript ExtensionAPI | **pi** (`>=0.74.0`) | ✅ Yes — 14 `prides_*` tools, `/prides` command, guards, widget, `resources_discover` |
| `agents/*.md` (25 files) | **Claude Code subagent** frontmatter (`mode`, `temperature`, `color`, `tools`, `permission`) | Claude Code `Task` tool | ❌ **Orphaned** — pi has no agent-discovery API |
| `prompts/*.md` (16 files) | frontmatter `agent: prides`, `subtask: true` | Claude Code subtask delegation | ⚠️ Contributed via `promptPaths` but uses keys pi does not consume; assumes a `Task`/subagent runtime |
| `skills/*.md` (8 active + 7 `.disabled`) | pi `SKILL.md` (`name`/`description`) | **pi** | ✅ Contributed via `skillPaths` — but **unrelated** to PRIDES (karpathy-guidelines, mcp-builder, shadcn-ui, memorius, agentation, code-search, handoff, improve-codebase-architecture) |

**The intended workflow** (per `agents/prides.md` coordinator + `prompts/*.md`):
a *Master Coordinator* agent that **only delegates** to phase subagents
(`@prototype-idea`, `@review-critic`, `@implement-coder`, …) via a `Task` tool,
leans on the `karpathy-guidelines` skill, and maintains `dev_notes/{TASKS,PROGRESS,CHANGELOG,ARCHITECTURE}.md`.
That is a **Claude Code agent-swarm workflow**, not a pi workflow.

---

## 3. Fit analysis — do they fit?

**Verdict: NO — not as currently assembled.** Two parallel, non-integrated definitions of
"PRIDES" live in one repo:

- **Framework side (`src/`):** a pi-native, engine-driven governance layer. Phase flow,
  gates, heartbeat, emergency stop, and guards are enforced by `PRIDESEngine` + tools.
  It does **not** use a coordinator/subagent swarm.
- **Content side (`agents/` + `prompts/`):** a Claude Code coordinator/subagent methodology.
  It is never discovered or executed by pi (no `agentPaths` in `resources_discover`
  Result type — verified against installed pi `0.80.6`).

Consequences:
- `agents/` (100 KB, 25 files) are **dead weight** shipped in the npm package.
- `prompts/` are contributed but their `agent:`/`subtask:` semantics and `@name` delegation
  don't map to pi's tool/command model.
- `skills/` are contributed but are a **vendored grab-bag** (1.2 MB, 136 files incl.
  `__pycache__/` and a nested `package-lock.json`) that will **collide** with the user's
  existing `~/.pi/agent/skills/` and bloat footprint.

### Comparison matrix

| Dimension | PRIDES `src/` (framework) | Current `agents/`+`prompts/` (content) | greptile/skills (reference) |
|-----------|---------------------------|----------------------------------------|----------------------------|
| Runtime | pi ExtensionAPI | Claude Code subagents | Anthropic Agent Skills (agentskills.io) |
| Unit of work | `prides_*` tool / `/prides` cmd | `@subagent` Task delegation | single-purpose `SKILL.md` |
| Discovery | ExtensionAPI + `resources_discover` | none in pi | filesystem `SKILL.md` scan |
| Scope per artifact | whole SDLC engine | one phase/persona | one focused task (PR review) |
| Format fit for pi | native | **mismatch** | **portable** (`name`/`description` frontmatter) |

---

## 4. Required adjustments (apply after sign-off)

These also fold in the two correctness issues from the prior code review.

### A. Runtime coherence (highest priority)
- **A1. Resolve `agents/` orphanage.** Either (a) delete `agents/` from the package
  (`files` in `package.json` drops `agents`), or (b) keep them only as **Claude-Code reference
  docs** under a clearly-named `reference/claude-code/` dir that pi does *not* auto-contribute.
  Do **not** ship them as if pi executes them.
- **A2. Fix `prompts/` to pi semantics.** Rewrite the 16 prompts to pi's prompt format (no
  `agent:`/`subtask:` keys; reference `prides_*` tools, not `@subagent` calls), OR move them to
  `reference/` if they are Claude-Code-only. Only pi-compatible prompts stay in `prompts/`.

### B. Correctness bugs (from prior review)
- **B1. Persistence reverts to oldest snapshot.** `loadState` (`src/index.ts:104-113`)
  returns the **first** matching entry; `getBranch()` is oldest→newest (verified in pi
  `session-manager`). `persist()` appends a full snapshot per op (`src/index.ts:132`).
  **Fix:** iterate keeping the **last** match (or upsert a single entry).
- **B2. Manual gates never enforce.** `blockingGates` (`src/phases.ts:85`) only blocks on
  `status==="fail"`; manual gates evaluate to `"pending"` (`src/gates.ts:102`) with **no
  sign-off path**. So `review` (R) and `accessibility` (E) gates are decorative.
  **Fix:** treat `pending` manual gates as blocking **and** add a sign-off tool
  (`prides_gate` `approve` flag or `/prides approve <gate>`), or document them as advisory.
- **B3. Declare missing peer dep.** `src/index.ts:24` imports `Text` from
  `@earendil-works/pi-tui`, absent from `package.json`. Add to `peerDependencies`.

### C. Packaging / skill set (enables "next level")
- **C1. Replace vendored `skills/` with PRIDES-derived skills** (Section 5). Remove the 8
  unrelated vendored skills + 7 `.disabled` from the package so only PRIDES skills are
  contributed via `skillPaths`.
- **C2. Remove dead code** (`hasBlockingGates` `src/engine.ts:411` — also false-positives at
  final phase; `isCriticalPhase` `:407`; `nextPulseDue` `src/heartbeat.ts:27`).

---

## 5. "Next level" — PRIDES skills modeled on greptile/skills

`greptileai/skills` is a **multi-skill repo of focused, single-purpose Anthropic Agent Skills**:
3 skills — `check-pr`, `cli-review`, `greploop` — all围绕 PR/review loops. Each is one
`SKILL.md` with frontmatter `name`, `description`, `license: MIT`, `compatibility`,
`metadata`, `allowed-tools`. Install in a multi-skill repo requires symlinks so each sub-skill
is discovered at the expected depth.

**This maps cleanly to pi**: pi discovers `skills/<name>/SKILL.md` via `skillPaths`, and pi's
SKILL.md convention also uses `name` + `description`. So we can author first-class PRIDES
skills that **call the existing `prides_*` tools** instead of the vendored grab-bag.

### Proposed skill set (one focused skill per phase/concern)

| Skill (dir) | Purpose | Mirrors greptile |
|-------------|---------|------------------|
| `skills/prides-init/SKILL.md` | Scaffold `.prides/`, `intent.json`, `dev_notes/`, set intent | (init) |
| `skills/prides-review/SKILL.md` | Run Review-phase gates + code-review checklist; blocks advance until green | `check-pr` |
| `skills/prides-gate-loop/SKILL.md` | Loop `prides_gates` → fix → re-run until all pass / manual sign-off | `greploop` |
| `skills/prides-deploy/SKILL.md` | Deploy-phase pre-flight + `deploy:check` gate | `cli-review` (gate-style) |
| `skills/prides-secure/SKILL.md` | Security audit gate + emergency-stop guidance | `check-pr` (audit) |
| `skills/prides-heartbeat/SKILL.md` | Record heartbeat pulses; explain STALLED/DRIFTING handling | — |

Each skill references the concrete tool names (`prides_status`, `prides_phase_advance`,
`prides_gates`, `prides_gate`, `prides_heartbeat`, `prides_emergency_stop`, …) so it is
operable inside pi today.

### SKILL.md template (greptile/agentskills style, pi-compatible)

```markdown
---
name: prides-gate-loop
description: >
  Repeatedly runs all PRIDES quality gates for the current phase, fixes failing
  gates, and re-runs until green or a manual gate needs human sign-off. Use when
  the user wants to "make the gates pass" before advancing a PRIDES phase.
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
2. For each `fail`, fix the underlying issue, then re-run `prides_gate <name>`.
3. For each `pending` manual gate, request human sign-off (do not self-approve).
4. Repeat until all gates are `pass` (or only manual gates remain pending and signed off).
5. Call `prides_phase_advance` (or `/prides next`) to proceed.
```

---

## 6. Action checklist (TDD-ordered)

- [ ] **A1** Decide `agents/` fate: delete from package **or** move to `reference/claude-code/`.
- [ ] **A2** Rewrite `prompts/` to pi format (or relocate Claude-Code-only prompts).
- [ ] **B1** Patch `loadState` → keep last matching entry (add test: reload returns newest).
- [ ] **B2** Add manual-gate blocking + sign-off (`prides_gate --approve` / `/prides approve`).
- [ ] **B3** Add `@earendil-works/pi-tui` to `peerDependencies`.
- [ ] **C1** Author the 6 PRIDES skills (Section 5); remove vendored unrelated `skills/`.
- [ ] **C2** Delete dead exports (`hasBlockingGates`, `isCriticalPhase`, `nextPulseDue`).
- [ ] Run `npm run check` (typecheck + lint + test) green after each change.
- [ ] Update `README.md` to describe the new skill set + drop Claude-Code assumptions.

---

## 7. Open decisions for the user

1. **`agents/` content** — delete, or keep as `reference/claude-code/` (documents the
   intended Claude-Code topology but is not pi-runtime)? *Recommend: keep as reference only.*
2. **Manual gates** — enforce (block) + add sign-off, or document as advisory? *Recommend: enforce + sign-off.*
3. **Skill granularity** — 6 skills as proposed, or collapse to 1 `prides` mega-skill?
   *Recommend: 6 focused skills (matches greptile philosophy).*
4. **Vendored skills** — hard-remove from repo, or move to a separate `vendor/` (not contributed)?
   *Recommend: remove from this package; they belong to the user's global skills, not the extension.*

---

## 8. References

- Repo under review: `plugins/pi-extensions/pi-prides/` (this dir)
- Engine/pure core: `src/{engine,phases,gates,heartbeat,scaffold,state,types}.ts`
- Host wiring: `src/index.ts` (`loadState` `:104`, `persist` `:131`, guard `:241-261`)
- pi API verified: `appendEntry(customType,data)` → `CustomEntry{type:"custom",customType,data}`;
  `getBranch()` oldest→newest; `resources_discover` Result = `{skillPaths?, promptPaths?}` only.
- Reference repo: https://github.com/greptileai/skills (skills: `check-pr`, `cli-review`, `greploop`;
  format: Anthropic Agent Skills / agentskills.io)
