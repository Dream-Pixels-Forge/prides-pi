/**
 * pi-prides — Skill handoff routing
 *
 * Pure function that maps the current PRIDES state to:
 *   - the primary specialist skill (prides-*)
 *   - cross-references to agentic-workflow skills (pipeline-orchestrator,
 *     dpf-agentic-engineer, test-driven-development, ...)
 *   - a recommended next action (prides_* tool call)
 *
 * Used by the `prides_orchestrate_handoff` tool and rendered inside the
 * `prides-orchestrate` skill so the agent gets a single, deterministic map
 * of "what to do next and which skills to load."
 */

import { computeDriftSeverity } from "./status.js";
import type { PRIDESState } from "./types.js";

export interface CrossReference {
	skill: string;
	purpose: string;
}

export interface Handoff {
	phase: PRIDESState["phase"];
	primarySkill: string;
	rationale: string;
	crossReferences: CrossReference[];
	nextAction: string;
	driftSeverity: "ok" | "warn" | "stop";
}

const AGENTIC_CROSS_REFS: CrossReference[] = [
	{
		skill: "pipeline-orchestrator",
		purpose:
			"Central coordinator for multi-skill workflows; routes tasks to the right specialist skill.",
	},
	{
		skill: "dpf-agentic-engineer",
		purpose:
			"Production-grade agent architecture, governance, and runtime patterns.",
	},
	{
		skill: "test-driven-development",
		purpose:
			"RED → GREEN → REFACTOR discipline for every implementation change.",
	},
	{
		skill: "subagent-driven-development",
		purpose:
			"Branch-per-task execution via Issues + PRs with Verdity verification gates.",
	},
	{
		skill: "loopy-agent",
		purpose:
			"19-concept agentic toolkit (middleware, plugins, state, streaming, eval gates).",
	},
	{
		skill: "dpf-debugger-engineer",
		purpose:
			"4-phase systematic debugging: reproduce → minimise → hypothesise → fix → regression-test.",
	},
];

/** Choose the primary skill + rationale from the current state. */
export function buildHandoff(state: PRIDESState): Handoff {
	const phase = state.phase;
	const failing = Object.values(state.gates).some((g) => g.status === "fail");
	const stalled = state.heartbeat?.status === "STALLED";
	const lastDrift = state.goalChecks.length
		? state.goalChecks[state.goalChecks.length - 1]
		: null;
	const driftSeverity = computeDriftSeverity(lastDrift?.driftScore ?? null);

	// Highest-priority routing first
	let primarySkill = "prides-init";
	let rationale = `In phase P (Prototype) with no intent yet — start with prides-init to scaffold the project.`;
	let nextAction = "prides_scaffold";

	if (state.emergencyStop) {
		primarySkill = "prides-secure";
		rationale =
			"Emergency stop active — halt all mutations, audit the cause, resume only after human sign-off.";
		nextAction = "prides_status";
	} else if (stalled) {
		primarySkill = "prides-heartbeat";
		rationale = `Agent is STALLED in phase ${phase} — record a fresh heartbeat with intent, or call prides_status to surface the cause.`;
		nextAction = "prides_heartbeat";
	} else if (phase === "R") {
		primarySkill = "prides-review";
		rationale = `In phase R (Review) — run review-phase gates, then prides_gate review approve=true for sign-off.`;
		nextAction = "prides_gates";
	} else if (phase === "I" && failing) {
		primarySkill = "prides-gate-loop";
		rationale = `In phase I (Implement) with failing gates — iterate via the gate loop until all pass.`;
		nextAction = "prides_gates";
	} else if (phase === "I") {
		primarySkill = "prides-implementation";
		rationale = `In phase I (Implement) — vertical-slice TDD: prides_task_add → test → code → prides_task_done.`;
		nextAction = "prides_task_add";
	} else if (phase === "D") {
		primarySkill = "prides-deploy";
		rationale = `In phase D (Deploy) — run pre-flight gates, deploy, log artifacts.`;
		nextAction = "prides_gates";
	} else if (phase === "E") {
		primarySkill = "prides-heartbeat";
		rationale = `In phase E (Extend) — wide heartbeat interval; check status, log new artifacts, iterate.`;
		nextAction = "prides_status";
	} else if (phase === "S") {
		primarySkill =
			driftSeverity === "stop" ? "prides-cybersec" : "prides-secure";
		rationale = `In phase S (Secure) — run security gates; severe drift routes to prides-cybersec for full audit.`;
		nextAction = "prides_gates";
	} else if (phase === "P") {
		// Default P with intent set → prides-implementation if user is building
		if (state.intent) {
			primarySkill = "prides-implementation";
			rationale = `In phase P (Prototype) with intent set — start vertical-slice implementation.`;
			nextAction = "prides_goal_set";
		} else {
			primarySkill = "prides-init";
			rationale = `In phase P (Prototype) with no intent — scaffold the project first.`;
			nextAction = "prides_scaffold";
		}
	}

	// Phase-specific cross-refs (additions on top of AGENTIC_CROSS_REFS)
	const phaseRefs: CrossReference[] = [];
	if (phase === "I") {
		phaseRefs.push({
			skill: "karpathy-guidelines",
			purpose:
				"Avoid over-complication; make surgical changes; surface assumptions.",
		});
	}
	if (phase === "S") {
		phaseRefs.push({
			skill: "cybersecurity",
			purpose:
				"Full OWASP / LLM-Top-10 / supply-chain / post-quantum / incident-response reference.",
		});
	}
	if (driftSeverity !== "ok") {
		phaseRefs.push({
			skill: "driftGuard",
			purpose:
				"Local module — handles goal-drift detection and acknowledgment.",
		});
	}

	return {
		phase,
		primarySkill,
		rationale,
		crossReferences: [...AGENTIC_CROSS_REFS, ...phaseRefs],
		nextAction,
		driftSeverity,
	};
}

/** Render a human-readable handoff string for display in the orchestrator skill. */
export function renderHandoffMarkdown(h: Handoff): string {
	const lines: string[] = [];
	lines.push(`# PRIDES Handoff — phase ${h.phase}`);
	lines.push("");
	lines.push(`**Primary skill:** \`${h.primarySkill}\``);
	lines.push(`**Rationale:** ${h.rationale}`);
	lines.push(`**Next action:** \`${h.nextAction}\``);
	lines.push(`**Drift severity:** ${h.driftSeverity}`);
	lines.push("");
	lines.push("## Cross-references");
	for (const r of h.crossReferences) {
		lines.push(`- **${r.skill}** — ${r.purpose}`);
	}
	return lines.join("\n");
}
