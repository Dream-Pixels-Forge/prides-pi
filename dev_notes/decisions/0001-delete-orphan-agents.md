# ADR 0001 — Drop the orphaned `agents/` Claude-Code directory

- **Date:** 2026-08-06 (originally) / 2026-09-05 (formalized in writing)
- **Status:** Accepted
- **Deciders:** pi-prides maintainer

## Context

The repository historically contained:

- `agents/*.md` — 25 files (~100 KB) using **Claude Code** subagent
  frontmatter (`mode`, `temperature`, `color`, `tools`, `permission`,
  `@subagent` delegation). They describe a Master Coordinator that delegates
  to phase-specific subagents via the Claude Code `Task` tool.
- `prompts/*.md` — 16 files using `agent: prides`, `subtask: true`
  frontmatter that assumes a Claude-Code subtask-delegation runtime.

These shipped in the npm package via `extensions/prides/index.ts`'s
`resources_discover` contribution. **However, pi has no agent API.** pi
discovers `skills/<name>/SKILL.md` and `prompts/<file>.md` but does **not**
discover Claude-Code agent files, does **not** invoke `@subagent`
delegations, and does **not** evaluate `mode`/`temperature`/`color`/`tools`
frontmatter. The Claude-Code coordinator/subagent topology is simply not a
runtime pi executes.

This was confirmed against installed pi `0.80.6` (`resources_discover` Result
type only contains `skillPaths?` and `promptPaths?`).

## Decision

**A1 from PLAN.md, executed in v1.4.0 (commit history):**

1. **`agents/` deleted from the package.** The directory was removed entirely.
   The orphan files were not pi-runtime, so keeping them in the package
   ("just in case") would have shipped 100 KB of dead weight in every
   install.

2. **`prompts/` rewritten to pi semantics** (v1.4.0, CHANGELOG §v1.4.0 A2).
   `agent:` / `subtask:` keys removed, `@subagent` references replaced with
   concrete `prides_*` tool calls. The 16 prompts now map to actual pi tools.

3. **`reference/claude-code/` directory created** to preserve the *historical
   design intent* — the coordinator/subagent topology is a coherent
   methodology, even though pi can't execute it. Future readers can study
   the design without us pretending pi runs it.

4. **README updated** to:
   - Describe `prompts/`, `reference/`, and `skills/` as three separate
     kinds of contributed content (no more bundled "agent persona").
   - Explicitly state `reference/claude-code/` is reference-only and not
     executed by the extension.

## Consequences

**Positive:**

- ~100 KB removed from the npm package.
- No false impression that pi executes Claude-Code subagents.
- `prompts/` and `skills/` both map cleanly to actual pi primitives, so the
  user experience is consistent (every contributed resource does something).
- Future maintainers (and the `prides-orchestrate` skill) have a single,
  accurate mental model: **the pi-native workflow is `prides_*` tools + the
  `/prides` command + the `prides-*` skills.**

**Negative / accepted trade-offs:**

- Users who *want* the Claude-Code coordinator topology can no longer
  install it from this package. They can still read `reference/claude-code/`
  and copy the files into a Claude-Code setup.
- Future agents / extensions built by third parties that *do* implement a
  Claude-Code-compatible runtime could re-use `reference/claude-code/` as a
  starting point — preserved exactly for that reason.

## Alternatives considered

- **Keep `agents/` shipped, hidden behind a feature flag.** Rejected — pi
  doesn't read it regardless, so the flag is theatre.
- **Convert `agents/*.md` into pi-native sub-skills.** Rejected — they were
  written for a multi-agent coordinator, not for single-agent workflows. The
  effort would have been a rewrite, not a conversion, and the result would
  be inferior to the existing `prides-*` skills.
- **Ship `agents/` only to users who opt in.** Rejected — npm `files`
  arrays can't be conditional per install without a postinstall script,
  which would add complexity for no gain.

## References

- `dev_notes/PLAN.md` §4.A1 (rationale) and §6 (action item, ✅ done)
- `dev_notes/AGENTIC_2026_REVIEW.md` (alignment analysis)
- `CHANGELOG.md` §v1.4.0 (A2: prompts rewritten) and §v1.3.0 (agents dir
  deletion as part of layout overhaul)
- PR #26, PR #27 (v1.4.0 release notes)
