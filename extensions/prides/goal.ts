/**
 * pi-prides — Goal loop (drift detection + verification)
 *
 * Pure helpers for goal tracking, drift detection, and final verification.
 * No filesystem, no host API, no global time — clock and judge are injected,
 * matching EngineDeps.
 */

import type { Clock, GoalCheckResult, GoalSpec, PRIDESState } from "./types.js";

const MAX_GOAL_CHECKS = 50;
const DRIFT_WARN_THRESHOLD = 0.5;
const DRIFT_STOP_THRESHOLD = 0.85;
const ACTIVITY_WINDOW_MS = 15 * 60 * 1000; // last 15 min of activity feeds the judge

/** Pull recent heartbeats/tasks/artifacts into a compact text block for the judge. */
export function summarizeRecentActivity(
	state: PRIDESState,
	now: number,
	windowMs: number = ACTIVITY_WINDOW_MS,
): string {
	const cutoff = now - windowMs;
	const recentEvents = state.events.filter((e) => e.at >= cutoff);
	const lines = recentEvents.map((e) => `[${e.kind}] ${e.message}`);
	if (state.heartbeat)
		lines.push(`[heartbeat] intent: ${state.heartbeat.intent}`);
	return lines.length ? lines.join("\n") : "(no recent activity recorded)";
}

export function buildDriftPrompt(
	goal: GoalSpec,
	recentActivity: string,
): string {
	return [
		`Original objective: ${goal.objective}`,
		`Success criteria: ${goal.successCriteria.join("; ")}`,
		goal.nonGoals?.length
			? `Non-goals (explicitly out of scope): ${goal.nonGoals.join("; ")}`
			: "",
		goal.constraints?.length
			? `Constraints: ${goal.constraints.join("; ")}`
			: "",
		"",
		"Recent agent activity:",
		recentActivity,
		"",
		"Is the agent still working toward the original objective, or has it drifted",
		"into unrelated or unscoped work? Respond with: aligned (yes/no), a drift",
		"score from 0 (on track) to 1 (fully off track), one-sentence reasoning, and",
		"a one-sentence correction if drifted.",
	]
		.filter(Boolean)
		.join("\n");
}

export function buildVerifyPrompt(
	goal: GoalSpec,
	recentActivity: string,
): string {
	return [
		`Original objective: ${goal.objective}`,
		"Success criteria (check each one):",
		...goal.successCriteria.map((c) => `- ${c}`),
		"",
		"Evidence of work done (tasks, artifacts, gate results):",
		recentActivity,
		"",
		"For each success criterion, has it actually been satisfied by the recorded",
		"evidence? List any UNMET criteria explicitly. Respond with: aligned (yes",
		"only if ALL criteria are met), drift score, reasoning, and unmet criteria.",
	].join("\n");
}

/** Parse the judge's free-text verdict into a GoalCheckResult. Defensive: judge output is untrusted text. */
export function parseGoalVerdict(
	kind: GoalCheckResult["kind"],
	raw: { status: string; message: string; score?: number },
	now: Clock,
): GoalCheckResult {
	const aligned = raw.status === "pass";
	return {
		kind,
		aligned,
		driftScore: typeof raw.score === "number" ? raw.score : aligned ? 0 : 1,
		reasoning: raw.message,
		checkedAt: now(),
	};
}

export function recordGoalCheck(
	state: PRIDESState,
	result: GoalCheckResult,
): PRIDESState {
	const goalChecks = [...state.goalChecks, result].slice(-MAX_GOAL_CHECKS);
	return { ...state, goalChecks };
}

export function lastGoalCheck(state: PRIDESState): GoalCheckResult | null {
	return state.goalChecks.length
		? state.goalChecks[state.goalChecks.length - 1]
		: null;
}

export function driftSeverity(score: number): "ok" | "warn" | "stop" {
	if (score >= DRIFT_STOP_THRESHOLD) return "stop";
	if (score >= DRIFT_WARN_THRESHOLD) return "warn";
	return "ok";
}

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // never judge-check more than once per 5 min

/**
 * Throttle gate for drift checks. A judge call costs real latency/money, so
 * this is deliberately decoupled from heartbeat frequency (which can be as
 * tight as 30s in critical phases) — see §7 for why.
 */
export function shouldRunDriftCheck(state: PRIDESState, now: number): boolean {
	if (!state.goal) return false;
	const last = lastGoalCheck(state);
	if (!last) return true; // never checked yet — always check once early
	return now - last.checkedAt >= MIN_CHECK_INTERVAL_MS;
}
