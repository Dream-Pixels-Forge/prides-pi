# PRIDES — Claude Code reference topology

The markdown files in this directory (`prides.md` coordinator + one file per
phase subagent) describe the **intended PRIDES agent topology for Claude Code**.
They are **reference documentation only** and are **not executed by the pi
extension** — pi has no agent-discovery API; the pi extension enforces PRIDES
via the `prides_*` tools, the `/prides` command, and the quality/heartbeat
guards in `src/index.ts`.

If you port PRIDES to Claude Code (or another subagent runtime), these files
are the coordinator + specialist definitions to load. They assume a `Task`/
subagent delegation model and the `karpathy-guidelines` skill, neither of which
exists in pi.

> The pi-native, supported workflow is: load the extension, then use the
> `prides_*` tools and the `/prides` command, or invoke the bundled PRIDES
> skills (`skills/prides-*/SKILL.md`).
