# pi-prides — Live GitHub Integration (planning)

> **Status: planning only — not implemented.** This document is the contract for a future v1.7.0 PR. Do not merge without an accompanying implementation.

## Problem

PRIDES today knows about phases, gates, heartbeats, and git workflow state — but it has **no awareness of what happens on GitHub after a PR is opened**. The agent must context-switch between:

- `prides_status` (local state)
- `gh pr view` (GitHub state)
- `gh issue list` (issue backlog)
- `prides_task_list` (task state)

Worse, when an agentic skill (e.g. `pipeline-scorer`, `memorius-store`, `prides-gate-loop`) wants to know *"did this PR close gate X?"*, it has to query two systems manually. The audit trail doesn't capture GitHub transitions, so retrospectives lose context.

## Goals (in priority order)

1. **PR awareness.** PRIDES knows when a PR is opened, sent for review, merged, or closed — without leaving the engine.
2. **Live status.** `/prides status` shows open PRs/issues and recent transitions alongside phase + gates.
3. **Pipeline hooks.** When a PR/Issue changes, PRIDES emits audit events that other skills (and pi session log) can subscribe to.
4. **Agentic-skill bridge.** Skills like `pipeline-orchestrator`, `pipeline-scorer`, `context-management` can request a GitHub snapshot via the engine — no `gh` CLI calls in the skill itself.
5. **Animated live status.** `/prides live` polls in the background and renders transitions as they happen (TUI ticker).

## Non-goals

- Reviewing / approving PRs (that's PR review tooling, not governance).
- Replacing `gh` CLI. We use it under the hood.
- Webhook receivers. The first cut is pull-based (polling), not push-based.
- Permissions / OAuth setup. Out of scope; document `gh auth login` prereq.

---

## Design

### 1. Type additions (`extensions/prides/types.ts`)

```ts
export type GHEventKind =
  | "pr_opened" | "pr_sent" | "pr_merged" | "pr_closed"
  | "issue_opened" | "issue_closed"
  | "sync";

export type GHEventSource = "prides-tool" | "prides-cmd" | "agentic-skill" | "manual";

export interface GHEvent {
  id: string;
  kind: GHEventKind;
  number: number;
  url: string;
  title: string;
  source: GHEventSource;
  phase: Phase;
  gateName?: string;
  taskId?: number;
  actor?: string;
  at: number;
}

export interface GHSyncState {
  lastSyncAt: number;
  openPRs: number;
  openIssues: number;
}

export interface GitHubClient {
  openPR(i: { repo; base; head; title; body; draft? }): Promise<{ number; url }>;
  createIssue(i: { repo; title; body; labels? }): Promise<{ number; url }>;
  listOpenPRs(repo): Promise<Array<{ number; title; url }>>;
  listOpenIssues(repo): Promise<Array<{ number; title; url }>>;
}
```

Add to `PRIDESState`: `githubEvents: GHEvent[]`, `githubSync?: GHSyncState`.
Add to `AuditKind`: `github_pr`, `github_issue`, `github_sync`.

### 2. Pure module (`extensions/prides/github.ts`)

A `gh`-CLI-backed `GitHubClient` implementation + parser for `gh` JSON output. Pure functions for parsing, side-effecting client wraps `gh` invocations. Both injectable for tests.

```ts
export function createGhCLI(): GitHubClient { ... }
export function parseGhPR(json: string): { number; url; title } { ... }
```

### 3. Engine methods (`extensions/prides/engine.ts`)

```ts
async openPR(input: { repo, base, head, title, body, draft?, gateName?, taskId?, actor? }): Promise<{ ok, message, event?: GHEvent }>;
async createIssue(input: { repo, title, body, labels?, gateName?, taskId?, actor? }): Promise<{ ok, message, event?: GHEvent }>;
async syncGitHub(repo: string): Promise<{ ok, message, sync: GHSyncState }>;
serializeGitHub(): { events: GHEvent[]; sync?: GHSyncState };
```

### 4. New tools (4)

- `prides_github_pr_send` — open a PR and record it; closes the optional `taskId` or `gateName`
- `prides_github_issue_create` — open an issue and record it
- `prides_github_status` — sync + return live state
- `prides_github_event_record` — record a manual transition (e.g. when a sub-agent merged a PR and you want to log it)

All emit `audit_event` of new kinds so the trail is complete.

### 5. Command additions (`/prides github ...` and `/prides live`)

```
/prides github pr <title> [--base main] [--head <branch>] [--gate <name>] [--task <id>] [--body <text>]
/prides github issue <title> [--body <text>] [--labels a,b,c] [--gate <name>] [--task <id>]
/prides github sync                          # poll now, show open PRs/issues
/prides github events                        # show last 20 transitions
/prides live                                 # ticker — poll every 5s, render changes
```

`/prides live` is the headline UX. It runs in a child task that polls `syncGitHub()` + re-reads local state, and renders diffs as colored lines:

```
[12:04:33] ● phase R, gates 3/4
[12:04:38] ▲ PR #8 opened by Patrick — "feat: live GitHub integration"
[12:04:42] ▼ PR #7 closed (not merged)
[12:04:50] ▲ issue #12 opened — "design: animated live status"
[12:04:55] ● phase R, gates 3/4 (no change)
```

Animation lives in the render function: each line is rendered with a fade-in (ansi color ramp) and a 1-frame "pulse" on phase/gate changes. No new TUI primitive needed — just `Text` with color codes.

### 6. Agentic-skill bridge

Skills should not call `gh` directly — they call a pi tool wrapper that already exists (`prides_github_status`) or read state from the engine. Document this in:

- `skills/prides-orchestrate/SKILL.md` — *"use prides_github_status, not gh CLI"*
- `skills/prides-gate-loop/SKILL.md` — *"after a fix, record the PR via prides_github_pr_send before merging"*
- `skills/prides-review/SKILL.md` — *"include linked issue numbers in the PR body"*

Add to `reference/`:
- `reference/agentic-skill-bridge.md` — a one-page guide listing which engine methods each skill should call.

### 7. Pipeline hooks

Three integrations:

a) **Auto-sync on `/prides status`.** Whenever the user (or a skill) calls `/prides status`, fire a background sync (fire-and-forget) and annotate the output with "synced 3s ago".

b) **Heartbeat coupling.** The heartbeat pulse includes `githubOpenPRs` / `githubOpenIssues` counts so `prides_heartbeat` reports them.

c) **Auto-record on `prides_git_merge`.** After recording a merge, if the merged branch has an open PR, emit a `pr_merged` event automatically.

### 8. Backwards compatibility

- `PRIDESState` gets two new top-level fields. Old sessions without them: hydrate with defaults (`githubEvents: []`, `githubSync: undefined`).
- `serialize()` includes them. No new `version` bump unless types changed in breaking ways — keep `version: 1`.
- `gh` not installed → tools return `{ ok: false, message: "gh CLI not found — install from https://cli.github.com" }`. Never throw.

---

## File-level plan

| File | Change |
|---|---|
| `extensions/prides/types.ts` | + `GHEvent`, `GHSyncState`, `GitHubClient`; 2 new `PRIDESState` fields; 3 new `AuditKind`s |
| `extensions/prides/state.ts` | + `recordGHEvent`, `setGHSync`, default `githubEvents: []` in initial state |
| `extensions/prides/github.ts` | **NEW** — `createGhCLI()`, parsers, `parseGhEventLine()` for ticker diff |
| `extensions/prides/engine.ts` | + 4 methods: `openPR`, `createIssue`, `syncGitHub`, `serializeGitHub` |
| `extensions/prides/index.ts` | + 4 tools, + 5 `/prides github` subcommands, + `/prides live` ticker |
| `extensions/prides/engine.test.ts` | + tests for the 4 new methods (mocked `GitHubClient`) |
| `extensions/prides/github.test.ts` | **NEW** — tests for `createGhCLI` (mocked child_process) and parsers |
| `skills/prides-orchestrate/SKILL.md` | add §"GitHub integration" pointing to `prides_github_status` |
| `skills/prides-gate-loop/SKILL.md` | add §"After merging" — call `prides_github_pr_send` first |
| `skills/prides-review/SKILL.md` | mention issue linking in PR body |
| `reference/agentic-skill-bridge.md` | **NEW** — one-page reference for skills |
| `README.md` | + §"Live GitHub integration" with example output of `/prides live` |
| `package.json` | bump to `1.7.0` |

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `gh` CLI not authenticated | Detect via `gh auth status` at engine init; surface in `prides_status` as a warning |
| Polling burns rate-limit | Default 60s interval for `/prides live`; expose `--interval <ms>` |
| Stale `githubSync` causes flicker | Cache for 5s; only re-render if delta is non-empty |
| Skills call `gh` directly, bypassing the engine | Lint `skills/*/SKILL.md` for `gh ` substring in CI; document the bridge |
| Type bloat slows serialization | Cap `githubEvents` at 50 (FIFO like `events`); expose via `serializeGitHub({ limit })` |

---

## Open questions for maintainers

1. **Auth model** — do we assume `gh` CLI is the only auth path, or should we also support `GITHUB_TOKEN` env-var direct REST calls? REST is faster but adds a new dep on the user setting a token.
2. **Multi-repo** — `PRIDESState` is per-project. A monorepo with multiple GitHub remotes would need a `repo` per event. First cut assumes one repo per project (the value of `intent.repository`).
3. **Animated ticker** — should it require a TTY, or fall back to a static log? (Recommend: TTY → animated, non-TTY → static with timestamps.)

---

## Definition of done

- [ ] All 4 tools registered with TypeBox schemas and concise descriptions
- [ ] `/prides github` subcommands autocompleted
- [ ] `/prides live` renders an animated ticker that updates within 5s of state change
- [ ] Audit events for every PR/Issue transition
- [ ] At least one agentic-skill updated to call the new tools instead of `gh`
- [ ] Backwards-compat: old session state still loads
- [ ] Tests: ≥80% coverage of `github.ts` and new `engine.ts` methods
- [ ] `npm run check` (typecheck + lint + test) green
- [ ] README updated with screenshot of `/prides live`

---

## Out of scope (v2+)

- Webhook receiver for push-based updates
- PR review automation / `gh pr review --approve`
- Issue triage / label automation
- Cross-repo orchestration
- OAuth setup helper
