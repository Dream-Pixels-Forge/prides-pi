# PRIDES for pi

A **PRIDES** (Prototype → Review → Implement → Deploy → Extend → Secure) governance
extension for the [pi](https://github.com/earendil-works/pi) coding agent.

PRIDES turns "just keep coding" into a **quality-gated, health-monitored software
development lifecycle**. The extension enforces the linear phase flow, runs
quality gates, records heartbeat pulses, supports an emergency stop, and keeps
an event-sourced audit trail of every state change — all persisted into the
session so it survives reloads and branch navigation.

## What it does

- **Phase progression** — enforces `P → R → I → D → E → S` linear flow.
- **Quality gates** — per-phase gates (`test-unit`, `linter`, `security`, …) that
  must pass before a phase can advance. Gates run real shell commands or check
  for artifact files; manual gates require human sign-off (and block advancement until
  signed off via `prides_gate <name> --approve` or `/prides approve <name>`).
- **Tool & session guards** — blocks `write`/`edit` during Review/Deploy/Secure
  phases and blocks session switches/forking while a critical phase has failing
  gates (all overridable with flags).
- **Heartbeat monitoring** — configurable pulse interval per phase; flags the
  agent as `STALLED` when double the interval elapses.
- **Emergency stop** — halts all mutating tools and signals the human governor;
  cleared with `prides_emergency_resume`.
- **Event-sourced state** — every change is appended to an audit trail and the
  full state is persisted to the session (branching-safe).
- **Scaffolding** — `prides_scaffold` creates `.prides/`, `intent.json`, and
  `dev_notes/` docs.

## Architecture

The heavy logic is **decoupled and unit-tested**. The extension is two layers:

```
extensions/prides/
├── types.ts          Domain types (pure)
├── phases.ts         Phase model + advance/set validation (pure)
├── gates.ts          Gate definitions + evaluation (pure, injected runner/globber)
├── heartbeat.ts      Interval lookup + staleness (pure)
├── scaffold.ts       File-plan generator (pure)
├── state.ts          State construction + event-sourced audit trail (pure)
├── shell.ts          POSIX shell-quoting helpers (pure)
├── gitWorkflow.ts    Branch taxonomy + step transitions (pure)
├── engine.ts         PRIDESEngine orchestration (pure — no pi, no fs, no clock)
└── index.ts          ExtensionAPI wiring (tools, /prides command, guards, resources)
```

`engine.ts` and everything it depends on import **nothing** from pi, the
filesystem, or the wall clock — those are injected — so the whole core is
covered by Vitest without a running pi. `index.ts` is the only host-aware file.

## Install

As a pi package (auto-discovered):

```bash
# Copy into your global or project extensions directory
cp -r pi-prides ~/.pi/agent/extensions/pi-prides
# or add to settings.json:  "extensions": ["/abs/path/pi-prides"]
```

Or load it directly for a session:

```bash
pi -e ./extensions/prides/index.ts
```

> Requires `@earendil-works/pi-coding-agent` >= 0.74.0. The bundled `skills/`
(real pi `SKILL.md` files) and `prompts/` are contributed to pi's resource
discovery, so `/init`, `/review`, etc. and the skills become available too.

## Tools (for the LLM)

| Tool | Purpose |
|------|---------|
| `prides_status` | Phase, heartbeat, gate, task, emergency state |
| `prides_phase_advance` | Advance to next phase (validates gates; `force`) |
| `prides_phase_set` | Set phase explicitly (`force` to skip gate checks) |
| `prides_gate` | Run a single named gate |
| `prides_gates` | Run all gates for the current phase |
| `prides_heartbeat` | Record a health pulse + intent |
| `prides_emergency_stop` | Halt mutations, signal governor |
| `prides_emergency_resume` | Clear the emergency stop |
| `prides_artifact` | Log a phase artifact to the audit trail |
| `prides_scaffold` | Generate `.prides/`, `intent.json`, `dev_notes/` |
| `prides_report` | Full session report + recommendations |
| `prides_task_add` | Track a task in the current phase |
| `prides_task_done` | Mark a task complete by id |
| `prides_task_list` | List all tracked tasks |
| `prides_git_status` | Show Git branch taxonomy, workflow step, PR status |
| `prides_git_branch` | Create/track branch (`feature/*`, `hotfix/*`, `bug/*`, `release/*`, `chore/*`) |
| `prides_git_rebase` | Record/execute branch rebase onto target base branch (`main`) |
| `prides_git_pr` | Record/create Pull Request details |
| `prides_git_review` | Record PR code review status (`approved`, `changes_requested`) |
| `prides_git_merge` | Merge feature branch into base branch (`main`) |

## Git Workflow & Branch Taxonomy

`pi-prides` includes an integrated Git Workflow Engine:
- **Branch Lifecycle**: `branch` → `code` → `rebase` → `PR` → `review` → `merge`
- **Branch Categories**:
  - `main` / `master` (protected base branch)
  - `feature/*` or `features/*` (new features & improvements)
  - `hotfix/*` (urgent production hotfixes)
  - `bug/*`, `bugs/*`, or `bugfix/*` (bug fixes)
  - `release/*` (version release branches)
  - `chore/*` or `docs/*` (maintenance, documentation)

## Commands (manual)

```
/prides status                       # current phase, gates, heartbeat, tasks
/prides next [force]                 # advance to next phase
/prides gates                        # run all gates for current phase
/prides gate <name>                  # run one gate (e.g. security)
/prides approve <gate>             # sign off a manual gate
/prides hb <intent>                  # record a heartbeat pulse
/prides stop <reason>                # emergency stop
/prides resume                       # clear emergency stop
/prides report                       # full session report
/prides scaffold <name> [purpose]    # generate project structure
/prides task add <desc>              # add a task
/prides task done <id>               # complete a task
/prides task                         # list tasks
/prides git status                   # show active git branch & workflow step
/prides git branch <name>            # track/create feature branch
/prides git rebase                   # record git rebase onto main
/prides git pr [number|url]          # record PR creation
/prides git review <approved|...>    # record PR review verdict
/prides git merge                    # record merge to main
```

## Flags

| Flag | Default | Effect |
|------|---------|--------|
| `--prides-guard` | `true` | Enable write guards in Review/Deploy/Secure |
| `--prides-lax` | `false` | Disable all write guards |
| `--prides-force` | `false` | Allow session switch/fork past guards |

## Phase config

| Phase | Name | Heartbeat | Criticality |
|-------|------|-----------|-------------|
| P | Prototype | 30s | High |
| R | Review | 2m | High |
| I | Implement | 30s | Critical |
| D | Deploy | 1m | Critical |
| E | Extend | 5m | Medium |
| S | Secure | 30s | Critical |

## Customizing gates

`prides_scaffold` writes `.prides/gates.config.json`. Add a `"gates"` array of
`GateDef` objects (`{ name, phase, type: "command"|"artifact"|"manual", command?, artifactGlob? }`)
to override the built-in `DEFAULT_GATES` for your project.

## Development (TDD — Non-Negotiable)

This project is strictly test-driven. The pure core must stay green:

```bash
npm install
npm test          # vitest — covers phases, gates, heartbeat, scaffold, state, engine
npm run typecheck # tsc --noEmit
npm run lint      # biome
npm run check     # typecheck + lint + test (runs on prepublish)
```

Tests inject a mock clock, command runner, and globber so no shell or
filesystem is touched.

## Bundled methodology content

The repository also ships the PRIDES agent persona and prompt library used to
drive the methodology (these are reference content, contributed to pi as
resources):

- `reference/claude-code/` — the intended PRIDES Claude Code coordinator + phase subagents
  (Prototype/Review/Implement/Deploy/Extend/Secure). **Reference only** — pi has no agent
  API, so these are not executed by the extension; the pi-native workflow is the `prides_*`
  tools, the `/prides` command, and the bundled PRIDES skills.
- `prompts/` — workflow prompts (`/init`, `/review`, `/start-sprint`, …)
- `skills/` — PRIDES-native pi skills:

| Skill | Triggers On | Purpose |
|-------|-------------|---------|
| `prides-init` | "start project", "initialise PRIDES" | Bootstrap PRIDES phase, scaffold, set intent |
| `prides-review` | "review", "code review", "PR check" | Run Review gates, require human sign-off |
| `prides-gate-loop` | "run gates", "check gates" | Iterate on failing gates until all pass |
| `prides-deploy` | "deploy", "release", "ship" | Deploy phase gates and pre-flight checks |
| `prides-secure` | "audit", "security", "harden" | Secure-phase audit + emergency stop |
| `prides-heartbeat` | "heartbeat", "status check" | Record health pulse and intent |
| `prides-cybersec` | "vulnerability", "CVE", "prompt injection", "supply chain", "PQC", "incident", "breach", "zero trust", "LLM security", "AI attack" | **Full 2026+ cybersecurity skill** — threat taxonomy, scanner config, remediation playbooks, incident response, post-quantum readiness |

### `prides-cybersec` Skill Structure

```
skills/prides-cybersec/
├── SKILL.md                          # Skill instructions + workflow
└── references/
    ├── threat-taxonomy.md            # Full 2026+ threat taxonomy (MITRE, OWASP)
    ├── remediation-playbooks.md      # Code-level fix recipes per threat type
    └── secure-defaults.md            # Security-by-default config checklists
```

**Covered threat domains:**
- Supply-chain attacks (T1.1 dependency confusion, T1.2 CI poisoning, T1.3 SBOM gaps)
- Secrets & IAM (T2.1 leakage, T2.2 JWT abuse, T2.3 over-privilege, T2.4 MFA bypass)
- Injection (T3.1 SQL, T3.2 SSRF, T3.3 XSS, T3.4 prompt injection, T3.5 SSTI)
- Cryptography (T4.1 weak algorithms, T4.2 TLS misconfig, T4.3 PQC readiness, T4.4 secrets at rest)
- Container / cloud-native (T5.1–T5.5: privilege escalation, image CVEs, RBAC, IMDS, storage ACLs)
- LLM & AI-specific (T6.1–T6.5: prompt injection, training data extraction, agent privilege escalation, AI-generated social engineering)
- Memory safety (T7: buffer overflows, use-after-free in FFI)
- Data privacy & compliance (T8: PII leakage, GDPR/AI Act)

## License

MIT © Dream-Pixels-Forge
