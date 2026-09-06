/**
 * pi-prides — Autonomous pipeline driver ("hands and eyes")
 *
 * Pure function that recommends the next action for the agent to take.
 * The `prides_drive` tool returns the recommendation but does NOT execute
 * anything automatically — execution requires explicit user opt-in per
 * call (per project constraint: never run bash without explicit opt-in).
 */

import { checkDriftBlock } from "./phases.js";
import type { GateDef, PRIDESState } from "./types.js";

export type DriveActionKind =
	| "scaffold"
	| "set_goal"
	| "plan"
	| "heartbeat"
	| "task_done"
	| "run_gates"
	| "acknowledge_drift"
	| "verify_goal"
	| "advance"
	| "complete"
	| "emergency_resume";

export interface DriveAction {
	kind: DriveActionKind;
	tool: string;
	reasoning: string;
	params?: Record<string, unknown>;
	urgent: boolean;
}

const STALE_HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Recommend the next action given current state, gate defs, and an optional
 * clock. Pure — no side effects, no host API.
 */
export function nextAction(
	state: PRIDESState,
	defs: GateDef[],
	now: () => number = Date.now,
): DriveAction {
	const phase = state.phase;

	// 1. Emergency stop is always the highest priority
	if (state.emergencyStop) {
		return {
			kind: "emergency_resume",
			tool: "prides_emergency_resume",
			reasoning:
				"Emergency stop is active — audit the cause, fix it, then call prides_emergency_resume to continue.",
			urgent: true,
		};
	}

	// 2. Unacknowledged drift warning
	const drift = checkDriftBlock(state);
	if (drift.blocked) {
		return {
			kind: "acknowledge_drift",
			tool: "prides_drift_ack",
			reasoning:
				`Active goal-drift warning (${drift.warningId}) must be acknowledged before advancing. ` +
				`Call prides_drift_ack to record an explicit acceptance.`,
			urgent: true,
			params: drift.warningId ? { warningId: drift.warningId } : undefined,
		};
	}

	// 3. Missing intent → scaffold
	if (!state.intent) {
		return {
			kind: "scaffold",
			tool: "prides_scaffold",
			reasoning:
				"No project intent set yet — call prides_scaffold to bootstrap .prides/ and dev_notes/.",
			urgent: false,
		};
	}

	// 4. Missing goal → set goal
	if (!state.goal) {
		return {
			kind: "set_goal",
			tool: "prides_goal_set",
			reasoning:
				"Project intent is set but no goal — call prides_goal_set with objective + checkable success criteria.",
			urgent: false,
		};
	}

	// 5. Stale heartbeat in a critical phase with no recent goal-check activity.
	// Only fires when we have history (goalChecks) that suggests the agent has
	// gone silent — not on a fresh project where other actions (plan, run_gates)
	// are higher priority.
	const lastDrift = state.goalChecks.length
		? state.goalChecks[state.goalChecks.length - 1]
		: null;
	const heartbeatStale =
		state.heartbeat &&
		now() - state.heartbeat.at > STALE_HEARTBEAT_THRESHOLD_MS;
	const lastCheckAge = lastDrift ? now() - lastDrift.checkedAt : null;

	if (
		(phase === "I" || phase === "D" || phase === "S") &&
		heartbeatStale &&
		lastCheckAge !== null &&
		lastCheckAge > STALE_HEARTBEAT_THRESHOLD_MS
	) {
		return {
			kind: "heartbeat",
			tool: "prides_heartbeat",
			reasoning: `In critical phase ${phase} with no recent heartbeat or goal check — call prides_heartbeat to confirm the agent is healthy.`,
			urgent: false,
		};
	}

	// 5b. Goal set but no plan generated yet
	if (state.goal && !state.planGeneratedAt) {
		return {
			kind: "plan",
			tool: "prides_plan",
			reasoning:
				"Goal is set but no plan has been generated — call prides_plan to materialize dev_notes/PLAN_AUTO.md.",
			urgent: false,
		};
	}

	// 6. Gates: run them if any are missing or failing for the current phase
	const phaseGates = defs.filter((d) => d.phase === phase);
	const phaseResults = phaseGates.map((d) => state.gates[d.name]);
	const hasFailing = phaseResults.some((r) => r && r.status === "fail");
	const hasUnrun = phaseGates.some((d) => !state.gates[d.name]);

	if (hasFailing || (hasUnrun && phaseGates.length > 0)) {
		return {
			kind: "run_gates",
			tool: "prides_gates",
			reasoning: hasFailing
				? `One or more ${phase}-phase gates are failing — run prides_gates, fix each, re-run until all pass.`
				: `${phase}-phase gates have not been evaluated — run prides_gates to evaluate them.`,
			urgent: hasFailing,
		};
	}

	// 7. Approaching a critical-phase transition → verify goal
	const lastCheck = lastDrift;
	const verifyNeeded =
		(phase === "I" || phase === "E") &&
		(!lastCheck || lastCheck.kind !== "verify" || !lastCheck.aligned);
	if (verifyNeeded) {
		return {
			kind: "verify_goal",
			tool: "prides_goal_verify",
			reasoning: `Approaching critical transition from ${phase} — call prides_goal_verify to confirm all success criteria before advancing.`,
			urgent: false,
		};
	}

	// 8. All gates pass and verify done → advance
	if (phase !== "S") {
		return {
			kind: "advance",
			tool: "prides_phase_advance",
			reasoning: `All ${phase}-phase gates pass and goal is verified — call prides_phase_advance to move to the next phase.`,
			urgent: false,
		};
	}

	// 9. Final phase reached
	return {
		kind: "complete",
		tool: "prides_report",
		reasoning:
			"Final phase (S / Secure) reached — all PRIDES gates green. Call prides_report to produce the final session report.",
		urgent: false,
	};
}

/** Render the action as a short instruction line for display. */
export function renderActionLine(a: DriveAction): string {
	const tag = a.urgent ? "⚠" : "→";
	return `${tag} ${a.tool} — ${a.reasoning}`;
}
