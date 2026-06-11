# PRIDES PI Extension

PRIDES methodology extension for [PI](https://github.com/earendil-works/pi) coding agent. Brings quality-gated SDLC to your AI coding sessions.

## What is PRIDES?

PRIDES (Prototype, Review, Implement, Deploy, Extend, Secure) is a mandatory, linear, health-monitored software development lifecycle where each phase is a living ecosystem of agents, subagents, and skills with continuous heartbeat monitoring.

## Features

- **Phase Progression**: Enforces P → R → I → D → E → S linear flow
- **Quality Gates**: Code review, test coverage, security, performance, accessibility checks
- **Heartbeat Monitoring**: Configurable pulse intervals per phase (30s to 5m)
- **Emergency Stop**: LOCK_MANDATES → DISCONNECT_A2A → SNAPSHOT_STATE → SIGNAL_GOVERNOR
- **Tool Guards**: Blocks write/edit in Review, Deploy, and Secure phases
- **Session Guards**: Prevents session switches with failing gates in critical phases
- **Project Scaffolding**: Generates `.prides/` directory structure and `intent.json`

## Installation

```bash
# Via PI (recommended)
pi install https://github.com/Dream-Pixels-Forge/prides-pi.git

# Or manually
cp prides.ts ~/.pi/agent/extensions/prides.ts
```

## Development (TDD — Non-Negotiable)

This project is strictly test-driven. Every change must:

1. **Write failing test first** — define the expected behavior
2. **Implement minimum code** — just enough to pass
3. **Refactor** — clean up while keeping tests green
4. **Never commit without green tests**

```bash
# Run tests (uses Node built-in test runner + tsx)
npm test

# Run tests in watch mode
npm run test:watch

# Bundle src/ → prides.ts before publishing
npm run bundle
```

### Project Structure

```
prides-pi/
├── src/                    # Source modules (TDD target)
│   ├── config.ts          # Phase definitions and heartbeats
│   ├── gates.ts           # Quality gate definitions
│   ├── state.ts           # State manager (pure logic)
│   ├── guards.ts          # Tool & session guards
│   ├── tools.ts           # Tool definitions factory
│   ├── commands.ts        # Slash command builder
│   └── index.ts           # Public API exports
├── tests/
│   └── unit/              # Unit tests (node:test)
├── scripts/
│   └── bundle.ts          # Bundles src/*.ts → prides.ts
├── prides.ts              # Bundled extension (committed, PI loads this)
├── package.json
└── README.md
```

### Test Coverage Requirements

- **100% of public APIs must have tests**
- Tests are run on every commit via `prepublishOnly`
- No PR merged without green test suite

## Usage

```bash
# Load extension
pi -e prides.ts

# Commands
/prides status       # Current phase, heartbeat, gates
/prides next         # Advance to next phase
/prides gates        # Run all quality gates
/prides hb           # Record heartbeat pulse
/prides stop         # Emergency stop
/prides report       # Full session report
/prides scaffold     # Generate PRIDES project structure
```

## Tools

| Tool | Purpose |
|------|---------|
| `prides_status` | Phase, heartbeat, gate status |
| `prides_phase_advance` | Advance phase (validates gates) |
| `prides_phase_set` | Set phase explicitly |
| `prides_gate` | Run single quality gate |
| `prides_gates` | Run all quality gates |
| `prides_heartbeat` | Record health pulse |
| `prides_emergency_stop` | Halt operations, signal governor |
| `prides_artifact` | Log phase artifacts |
| `prides_scaffold` | Generate project scaffold |
| `prides_report` | Session report with recommendations |

## Commands vs Skills

PRIDES has two types of invocations: **commands** (manual) and **skills** (automatic).

### Commands (Manual)

Commands are invoked by the user or agent via `/prides <subcommand>`. Use these for explicit actions:

| Command | Description |
|---------|-------------|
| `/prides status` | Current phase, heartbeat, gates |
| `/prides next` | Advance to next phase |
| `/prides gates` | Run all quality gates |
| `/prides hb` | Record heartbeat pulse |
| `/prides stop` | Emergency stop |
| `/prides report` | Full session report |
| `/prides scaffold` | Generate PRIDES project structure |
| `/prides task add <desc>` | Add a task to current phase |
| `/prides task done <id>` | Mark task as completed |
| `/prides task` | List tasks with progress |

### Skills (Automatic)

Skills are guard functions that run automatically on events. They enforce PRIDES rules without manual invocation:

| Skill | Trigger | Behavior |
|-------|---------|----------|
| **Tool Guard** | Before write/edit operations | Blocks file modifications in Review, Deploy, and Secure phases |
| **Session Guard** | Before session switches | Prevents switching when gates fail in critical phases |
| **Gate Evaluator** | On `prides_gate` / `prides_gates` | Evaluates quality gates using artifact/incident context |

### When to Use Each

- **Use commands** when you want explicit control: checking status, advancing phases, logging artifacts
- **Skills run automatically** — you don't invoke them. They enforce rules in the background.
- If a skill blocks an operation, fix the underlying issue (e.g., pass gates) rather than bypassing the guard

## Phase Config

| Phase | Name | Heartbeat | Criticality |
|-------|------|-----------|-------------|
| P | Prototype | 30s | High |
| R | Review | 2m | High |
| I | Implement | 30s | Critical |
| D | Deploy | 1m | Critical |
| E | Extend | 5m | Medium |
| S | Secure | 30s | Critical |

## License

MIT © Dream-Pixels-Forge

## Source

Built from [forge-brain](https://github.com/Dream-Pixels-Forge/forge-brain) wiki — see `wiki/concepts/pi-extension-development.md` and `wiki/sources/pi-prides-extension.md`.
