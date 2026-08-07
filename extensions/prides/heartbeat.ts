/**
 * pi-prides — Heartbeat monitoring
 *
 * Pure helpers for heartbeat interval lookup, staleness detection,
 * and task-aware health assessment.
 */

import { PHASE_CONFIG } from "./phases.js";
import type {
	Clock,
	HeartbeatPulse,
	HeartbeatStatus,
	Phase,
	PRIDESState,
} from "./types.js";

export function intervalFor(phase: Phase): number {
	return PHASE_CONFIG[phase].heartbeatMs;
}

/** A pulse is "stalled" if more than 2x the phase interval has elapsed since it. */
export function isStalled(state: PRIDESState, now: Clock): boolean {
	if (!state.heartbeat) return false;
	return now() - state.heartbeat.at > intervalFor(state.phase) * 2;
}

/** Classify a pulse's status from the gap since the previous one. */
export function classifyPulse(gapMs: number, phase: Phase): HeartbeatStatus {
	const interval = intervalFor(phase);
	if (gapMs > interval * 2) return "STALLED";
	if (gapMs > interval) return "DRIFTING";
	return "HEALTHY";
}

export function makePulse(
	phase: Phase,
	intent: string,
	status: HeartbeatStatus,
	now: Clock,
	resourceUsage?: HeartbeatPulse["resourceUsage"],
): HeartbeatPulse {
	return { phase, intent, status, at: now(), resourceUsage };
}

/** Task-aware stalled assessment. Returns extra context when stalled. */
export interface StalledContext {
	stalled: boolean;
	incompleteTaskCount: number;
	incompleteTaskIds: number[];
	lastPulseAge: number | null;
	phaseInterval: number;
}

export function assessStaleness(state: PRIDESState, now: Clock): StalledContext {
	const interval = intervalFor(state.phase);
	const incompleteTasks = state.tasks.filter(
		(t) => t.status !== "completed" && t.phase === state.phase,
	);
	const lastPulseAge = state.heartbeat ? now() - state.heartbeat.at : null;
	const stalled = lastPulseAge !== null && lastPulseAge > interval * 2;

	return {
		stalled,
		incompleteTaskCount: incompleteTasks.length,
		incompleteTaskIds: incompleteTasks.map((t) => t.id),
		lastPulseAge,
		phaseInterval: interval,
	};
}

/** Generate a human-readable stalled reason with task context. */
export function stalledReason(state: PRIDESState, now: Clock): string | null {
	const ctx = assessStaleness(state, now);
	if (!ctx.stalled) return null;

	const parts: string[] = [
		`Phase ${state.phase} stalled (no heartbeat for ${Math.round((ctx.lastPulseAge ?? 0) / 1000)}s, interval: ${Math.round(ctx.phaseInterval / 1000)}s)`,
	];

	if (ctx.incompleteTaskCount > 0) {
		parts.push(
			`${ctx.incompleteTaskCount} incomplete task(s): ${ctx.incompleteTaskIds.map((id) => `#${id}`).join(", ")}`,
		);
	}

	return parts.join(" — ");
}
