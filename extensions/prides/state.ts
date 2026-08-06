/**
 * pi-prides — State construction + event-sourced audit trail
 *
 * Pure helpers. `recordEvent` returns a NEW state (immutability makes the
 * engine trivially testable and the audit trail append-only).
 */
import type {
	Clock,
	PRIDESAuditEvent,
	PRIDESState,
	ProjectIntent,
} from "./types.js";

const MAX_EVENTS = 200;

export function createInitialState(
	now: Clock,
	intent?: ProjectIntent,
): PRIDESState {
	return {
		version: 1,
		phase: "P",
		phaseEnteredAt: now(),
		tasks: [],
		nextTaskId: 1,
		gates: {},
		heartbeat: null,
		emergencyStop: false,
		artifacts: [],
		events: [],
		intent,
	};
}

export function recordEvent(
	state: PRIDESState,
	event: Omit<PRIDESAuditEvent, "at">,
	now: Clock,
): PRIDESState {
	const full: PRIDESAuditEvent = { ...event, at: now() };
	const events = [...state.events, full];
	return {
		...state,
		events:
			events.length > MAX_EVENTS
				? events.slice(events.length - MAX_EVENTS)
				: events,
	};
}
