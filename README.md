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
# Via PI
pi install Dream-Pixels-Forge/prides-pi

# Or manually
cp prides.ts ~/.pi/agent/extensions/prides.ts
```

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
