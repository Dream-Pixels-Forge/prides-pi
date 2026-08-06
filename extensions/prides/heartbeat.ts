/**
 * pi-prides — Heartbeat monitoring
 *
 * Pure helpers for heartbeat interval lookup and staleness detection.
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

/** Epoch ms at which the next pulse is due, or null if none recorded yet. */
export function nextPulseDue(state: PRIDESState): number | null {
	if (!state.heartbeat) return null;
	return state.heartbeat.at + intervalFor(state.phase);
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
