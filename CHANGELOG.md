# Changelog

All notable changes to **pi-prides** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-08-06

### Changed

- **Layout overhaul** — moved the extension source into `extensions/prides/`
  (was flat at the repo root in v1.2.0). This makes the package installable
  via `cp -r extensions/prides ~/.pi/agent/extensions/prides` (or via
  `settings.json -> pi.extensions`) without polluting the repo root.
- **Replaced flat single-file entry** (`prides.ts`) with a modular
  `index.ts` that wires the pure `PRIDESEngine` to pi's `ExtensionAPI`.
- **Tool surface expanded to 20 tools** (was a smaller set in v1.2.0): the
  phase / gate / heartbeat / emergency / task / artifact / scaffold / report
  set plus a full git-workflow tool family (branch, rebase, pr, review,
  merge, status).

### Added

- **Git workflow engine** (`gitWorkflow.ts`) with branch taxonomy
  (`main` / `feature/*` / `hotfix/*` / `bug/*` / `release/*` / `chore/*`)
  and step transitions (`branch` → `code` → `rebase` → `PR` → `review`
  → `merge`).
- **Shell-safety helpers** (`shell.ts`) — POSIX single-quote escaping
  (`shQuote`) and an `isSafeWord` allow-list used by the git workflow to
  reject shell metacharacters, leading `-` (option injection), and `..`
  segments (path traversal).
- **`eval` gate type** with an injected LLM `Judge` (host wires it to a
  configured model).
- **Event-sourced audit trail** (`state.ts`) with capped in-memory (200)
  and on-disk (50) retention.
- **Append-only session persistence** — `loadState` always picks the
  *latest* snapshot (oldest-first branch iteration), and `slimState` trims
  the audit trail before write to bound session growth.
- **Session-switch / session-fork guards** (`--prides-force` to override)
  while a critical phase has failing gates.
- **Bundled skills** at repo root: `prides-init`, `prides-review`,
  `prides-gate-loop`, `prides-deploy`, `prides-secure`, `prides-heartbeat`,
  and `prides-cybersec` (full 2026+ threat taxonomy with remediation
  playbooks).
- **Bundled prompts**: `/init`, `/review`, `/start-sprint`, `/prototype`,
  `/audit-*`, `/deploy`, `/extend`, `/secure`, etc.
- **Reference subagents** for the Claude Code methodology under
  `reference/claude-code/` (one per phase; reference-only — pi has no
  agent API).
- **`pi` package metadata** at root (`package.json#pi.extensions`) so
  the repo root is auto-discoverable as a pi package.

### Fixed

- Removed unused `existsSync` import in `index.ts`.
- `isSafeWord` now rejects empty strings, leading `.` (relative paths),
  leading `-` (option injection), and `..` segments (path traversal).
- `shell.test.ts` is now POSIX-aware — the POSIX round-trip checks skip
  on Windows because `cmd.exe` does not honor POSIX single-quote escaping
  (`shQuote` is correct for pi's bash / Git Bash shell, which is what pi
  uses on every platform).
- README architecture diagram and `pi -e` invocation paths updated to
  reflect the actual `extensions/prides/` layout.
- Docstring "14 tools" → "20 tools".

### Quality

- 51/51 vitest unit tests pass (pure core is fully decoupled from pi / fs /
  `Date.now` — clock, runner, globber, and judge are all injected).
- `tsc --noEmit` clean, `biome check` clean.

### Migration from v1.2.0

v1.2.0 was a flat single-file package (`@dream-pixels-forge/prides-pi`,
`main: prides.ts`). v1.3.0 is a nested, modular package.

To upgrade:

1. Uninstall v1.2.0 (remove the directory containing `prides.ts` from your
   pi extensions).
2. Install v1.3.0: copy `extensions/prides/` into your pi extensions
   directory, or add the repo root to `settings.json` under `extensions`.
3. State from v1.2.0 sessions is not auto-migrated — `loadState` looks for
   `customType === "prides-state"` entries which v1.2.0 did not write.
   Phase will reset to `P` on first run; use `prides_phase_set` to jump
   back to the phase you were in.

## [1.2.0] and earlier

See git history. v1.2.0 and earlier used a flat layout with `prides.ts`
at the repo root and were maintained on a separate branch line.
