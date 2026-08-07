# CHANGELOG

## v1.6.0 (2026-08-06)

### Added
- **Warning system**: Track active warnings that block git operations and phase advancement
- **`prides_warn`**: Add warnings with severity (info/warn/error) and category
- **`prides_warn_resolve`**: Resolve (dismiss) warnings after fixing issues
- **`prides_warn_list`**: List all active warnings
- **Auto-warning on gate failure**: Failing gates automatically generate error warnings; passing gates auto-resolve related warnings
- **Git operation guards**: Block `git commit`, `git push`, `gh pr create/merge` when:
  - Emergency stop is active
  - Any gate is failing
  - Blocking warnings (warn/error) exist
  - Manual gates are pending
  - Branch doesn't follow PRIDES taxonomy
- **Widget warnings display**: Widget now shows warning/error count and "commit/push blocked" indicator
- **`shouldBlockGitOps()`**: Engine method that checks all git-blocking conditions

### Changed
- Widget now shows `⚠ N error(s) · M warning(s) — commit/push blocked` when warnings exist

## v1.5.0 (2026-08-06)

### Added
- **Git workflow auto-init**: New projects auto-detect current git branch on scaffold and initialize workflow tracking
- **Git taxonomy check**: Existing projects check if current branch follows PRIDES taxonomy (main, feature/*, hotfix/*, bug/*, release/*, chore/*) on session start
- **`checkBranchConforms()`**: Pure function that validates branch names against PRIDES taxonomy
- **`autoDetectGit()`** and **`initGitFromBranch()`**: Engine methods for git state initialization
- **`detectGitBranch()`**: Host helper that runs `git branch --show-current`

### Changed
- `prides_scaffold` tool now auto-inits git workflow after scaffolding
- `/prides scaffold` command now auto-inits git workflow after scaffolding
- `session_start` event now detects and tracks the current git branch, warning if non-conformant

## v1.4.0 (2026-08-06)

### Added
- **I→D 100% task gate**: `canAdvance()` now requires all Implement-phase tasks to be completed before advancing to Deploy
- **prides-orchestrate skill**: Central orchestrator that classifies tasks and routes to specialist skills
- **Heartbeat task-awareness**: `assessStaleness()` returns incomplete task context; `stalledReason()` generates human-readable messages with task IDs
- **peerDependencies**: Added `@earendil-works/pi-tui` to package.json

### Changed
- **Prompts rewritten**: All 16 prompts/ files updated to pi semantics (removed `agent:`/`subtask:` frontmatter, replaced `@subagent` with `prides_*` tools)
- **Heartbeat tool**: Now shows incomplete task count when stalled

### Removed
- **Dead code**: `isCriticalPhase()` and `hasBlockingGates()` from engine.ts
- **Dead code**: `nextPulseDue()` from heartbeat.ts

### Fixed
- B3: Missing pi-tui peer dependency
- C2: Dead exports that were never used externally
- A2: Prompts used Claude Code format instead of pi format

## v1.3.1 (2026-08-06)

### Fixed
- Removed unused `existsSync` import (typecheck + biome lint)
- Strengthened `isSafeWord` in shell.ts
