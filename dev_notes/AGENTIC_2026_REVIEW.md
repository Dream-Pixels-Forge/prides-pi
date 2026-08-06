# Deep Search — 2026 Agentic Workflow Landscape vs PRIDES

- **Date:** 2026-07-14
- **Method:** Web research of primary 2026 sources (Anthropic "Building Effective
  Agents", the Anthropic Agent Skills spec / agentskills.io), compared against the
  PRIDES pi-extension (`src/`) and the 6 PRIDES skills shipped in `skills/`.
- **Goal:** Determine whether PRIDES aligns with current agentic-workflow best
  practice, and what (if anything) needs adjusting.

---

## 1. What "agentic workflow" means in 2026 (from the sources)

Anthropic draws the core distinction:
- **Workflow** — LLMs + tools orchestrated through *predefined code paths*.
- **Agent** — the LLM *dynamically* directs its own process and tool use in a loop.

and publishes **five workflow patterns** that dominate 2026 agentic design:

| Pattern | What it is | Source signal |
|---------|-----------|---------------|
| **Prompt chaining** | Sequence of steps; each step's output feeds the next, with **programmatic "gate" checks** between steps to stay on track | "add programmatic checks (see 'gate') on any intermediate steps" |
| **Routing** | Classify input → send to a specialized handler | "separation of concerns, more specialized prompts" |
| **Parallelization** | Run subtasks/votes concurrently; includes a **guardrails** screening variant | "guardrails where one model screens … another processes" |
| **Orchestrator-workers** | Central LLM decomposes work, delegates to workers, synthesizes | "dynamically breaks down tasks, delegates … synthesizes" |
| **Evaluator-optimizer** | One call generates, another evaluates + gives feedback **in a loop** | "generate a response while another provides evaluation and feedback in a loop" |

Cross-cutting 2026 principles from the same sources:
- **Maintain control** via stopping conditions / iteration caps (the "agent loop" must be bounded).
- **Human-in-the-loop** for sensitive actions (approval gates).
- **Tools + their documentation** are first-class (prompt-engineer the tool, not just the prompt).
- **Agent Skills** (agentskills.io) is the portable unit of capability: a folder with
  `SKILL.md` (`name` + `description` minimum, plus instructions; optional `scripts/`,
  `references/`, `assets/`), discovered at startup and **activated by progressive
  disclosure** when a task matches the description. Skills are meant to be **reusable
  across any skills-compatible agent**.

---

## 2. PRIDES ↔ 2026 landscape — alignment map

| 2026 pattern / principle | PRIDES equivalent | Verdict |
|--------------------------|-------------------|---------|
| Prompt chaining + **gate** checks | `canAdvance` + per-phase `GateDef`s (`command`/`artifact`/`manual`) block phase transitions | ✅ Direct match |
| Guardrails / parallel screening | `tool_call` guard (blocks writes in R/D/S) + `emergencyStop` | ✅ Match (pi-side) |
| Evaluator-optimizer loop | `prides-gate-loop` skill (run gates → fix → re-run until green) | ✅ Direct match |
| Human-in-the-loop approval | `manual` gates (`review`, `accessibility`) + `prides_gate --approve` / `/prides approve` | ✅ Match (enforcement fixed) |
| "Maintain control" / stopping conditions | `heartbeat` STALLED detection + `emergencyStop` circuit breaker | ✅ Match |
| Tools + docs are first-class | 14 `prides_*` tools with `promptSnippet`/`promptGuidelines` | ✅ Match |
| Agent Skills standard (portable, progressive disclosure) | 6 `skills/prides-*/SKILL.md` (name/description frontmatter, reference pi tools) | ✅ Match in shape; pi-bound in body |
| Spec/context grounding | `setIntent` + scaffold `intent.json` / PRD | ✅ Match (spec-driven) |
| Event-sourced audit / observability | `recordEvent` audit trail + widget | ✅ Match (no exported telemetry) |
| **Orchestrator-workers** | — (PRIDES governs a *single* agent linearly) | ⚠️ Gap |
| **Routing** (classify → specialist) | — (phase implies handler, but no dynamic routing) | ⚠️ Gap |
| **LLM-as-judge / semantic eval gate** | Gate types are `command`/`artifact`/`manual` only | ⚠️ Gap |

**Verdict: PRIDES aligns strongly with the 2026 consensus.** Its gate/loop/human-
in-the-loop/stopping-condition/skills design mirrors Anthropic's published patterns
and the Agent Skills standard almost one-to-one. The gaps are *additive*, not
contradictions.

---

## 3. Adjustments PRIDES needs to stay 2026-current

### A. Add an `eval` (LLM-as-judge) gate type — HIGH
2026's evaluator-optimizer relies on a *semantic* evaluator, not just exit-codes.
PRIDES `GateType` is `command | artifact | manual`. Add `"eval"`:
- `GateDef` gains an optional `prompt` (or `evaluator` ref); `evaluateGate` calls the
  host LLM (injected `judge`) and records `pass`/`fail`/`warn` from the verdict.
- Enables spec-adherence / code-quality gates beyond shell commands.
- Aligns PRIDES with the evaluator-optimizer pattern and "automating evals".

### B. Orchestrator / routing hook — MEDIUM
2026 emphasizes **orchestrator-workers** + **routing**. PRIDES is single-agent/linear.
- Ship an `prides-orchestrate` skill (or a `route` gate) that classifies the current
  task and maps it to the right PRIDES specialist skill (`prides-review`,
  `prides-deploy`, …). The `reference/claude-code/` coordinator already sketches this;
  surface it as a real pi skill.
- This keeps PRIDES as the *governance spine* while letting a (future) orchestrator
  delegate to specialist skills — matching Anthropic's orchestrator-workers.

### C. Guardrail / pre-action screening skill — LOW
Anthropic's guardrails pattern is a dedicated screening call. Add a thin
`prides-guard` skill (or extend the `tool_call` guard) that screens a planned action
against policy before execution — a portable, reusable guardrail unit.

### D. Telemetry export — LOW
2026 stresses traces/metrics. Add `prides_report --json` (or an event stream) so the
audit trail can feed external observability, not just the in-session widget.

### E. Keep skills portable in *shape* — LOW
Our `skills/prides-*` already follow agentskills.io. To maximize portability, keep
`SKILL.md` bodies tool-agnostic where possible and note the pi-specific `prides_*`
binding in a `references/` file rather than the main instructions. (Already largely
true.)

---

## 4. Priority

1. **A — `eval` gate type** (highest leverage; directly adds 2026 evaluator-optimizer).
2. **B — orchestrator/routing skill** (closes the biggest conceptual gap).
3. C, D, E — polish / observability.

No change is required for PRIDES to be *correct* or *aligned*; A–B are the
recommended upgrades to be unambiguously "2026-current".

---

## 5. Sources

- Anthropic — *Building Effective Agents*: https://www.anthropic.com/engineering/building-effective-agents
  (workflows vs agents; prompt chaining + gate; routing; parallelization + guardrails;
  orchestrator-workers; evaluator-optimizer; "maintain control" stopping conditions)
- Anthropic Agent Skills (spec + overview): https://agentskills.io and
  https://docs.anthropic.com/en/agents-and-tools/agent-skills/overview
  (skill = folder + `SKILL.md`; progressive disclosure; portable across agents)
- Reference implementation of the skill standard: https://github.com/greptileai/skills
  (focused single-purpose skills: `check-pr`, `cli-review`, `greploop`)
- Local: `src/{phases,gates,engine}.ts`, `skills/prides-*/SKILL.md`, `reference/claude-code/`
