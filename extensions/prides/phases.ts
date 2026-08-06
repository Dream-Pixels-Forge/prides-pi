/**
 * pi-prides — Phase model
 *
 * Pure functions describing the mandatory linear PRIDES flow and the gate
 * requirements for advancing. No I/O, no host dependencies.
 */
import type {
	GateDef,
	GateResult,
	Phase,
	PhaseConfig,
	PRIDESState,
} from "./types.js";

export const PHASE_ORDER: Phase[] = ["P", "R", "I", "D", "E", "S"];

export const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
	P: {
		phase: "P",
		name: "Prototype",
		heartbeatMs: 30_000,
		criticality: "high",
	},
	R: { phase: "R", name: "Review", heartbeatMs: 120_000, criticality: "high" },
	I: {
		phase: "I",
		name: "Implement",
		heartbeatMs: 30_000,
		criticality: "critical",
	},
	D: {
		phase: "D",
		name: "Deploy",
		heartbeatMs: 60_000,
		criticality: "critical",
	},
	E: {
		phase: "E",
		name: "Extend",
		heartbeatMs: 300_000,
		criticality: "medium",
	},
	S: {
		phase: "S",
		name: "Secure",
		heartbeatMs: 30_000,
		criticality: "critical",
	},
};

export function phaseIndex(phase: Phase): number {
	return PHASE_ORDER.indexOf(phase);
}

export function getPhaseConfig(phase: Phase): PhaseConfig {
	return PHASE_CONFIG[phase];
}

export function isCritical(phase: Phase): boolean {
	return PHASE_CONFIG[phase].criticality === "critical";
}

export function isValidPhase(value: string): value is Phase {
	return (PHASE_ORDER as string[]).includes(value);
}

export function nextPhase(phase: Phase): Phase | null {
	const i = phaseIndex(phase);
	if (i < 0 || i >= PHASE_ORDER.length - 1) return null;
	return PHASE_ORDER[i + 1];
}

/** Gates that are required to pass before leaving `phase`. */
export function gatesForPhase(phase: Phase, defs: GateDef[]): GateDef[] {
	return defs.filter((d) => d.phase === phase);
}

/** Gates for the current phase that are currently blocking advancement.
 *
 * A gate blocks when it is:
 *  - `fail` (command/artifact gate that did not pass), or
 *  - `pending` AND `manual` (a manual gate that has been evaluated but not
 *    signed off), or
 *  - missing AND `manual` (a manual gate that was never evaluated/signed off).
 *
 * Command/artifact gates that have simply not been run yet do NOT block — they
 * only block once they are actually evaluated and fail.
 */
export function blockingGates(
	state: PRIDESState,
	defs: GateDef[],
): GateResult[] {
	const blocking: GateResult[] = [];
	for (const d of gatesForPhase(state.phase, defs)) {
		const r = state.gates[d.name];
		if (!r) {
			if (d.type === "manual") {
				// unsigned / never-evaluated manual gate blocks advancement
				blocking.push({
					name: d.name,
					phase: d.phase,
					status: "pending",
					message: "Manual gate not signed off",
					ranAt: 0,
				});
			}
			continue;
		}
		if (r.status === "fail") blocking.push(r);
		else if (r.status === "pending" && d.type === "manual") blocking.push(r);
	}
	return blocking;
}

export interface AdvanceCheck {
	ok: boolean;
	next: Phase | null;
	reason?: string;
}

/**
 * Can we advance from the current phase? Requires:
 *  - not already at the final phase
 *  - no currently-failing gate for the current phase
 */
export function canAdvance(state: PRIDESState, defs: GateDef[]): AdvanceCheck {
	const next = nextPhase(state.phase);
	if (!next) {
		return {
			ok: false,
			next: null,
			reason: "Already at the final phase (S / Secure)",
		};
	}
	const blocking = blockingGates(state, defs);
	if (blocking.length > 0) {
		return {
			ok: false,
			next,
			reason: `Failing gate(s) on ${state.phase}: ${blocking.map((b) => b.name).join(", ")}`,
		};
	}
	return { ok: true, next };
}

/** Validate a target phase for `prides_phase_set`. */
export function validateSetPhase(
	target: Phase,
	state: PRIDESState,
	defs: GateDef[],
	force: boolean,
): AdvanceCheck {
	if (!isValidPhase(target)) {
		return { ok: false, next: null, reason: `Invalid phase: ${target}` };
	}
	if (target === state.phase) {
		return { ok: true, next: target };
	}
	if (!force) {
		const check = canAdvance(state, defs);
		if (!check.ok) {
			return {
				ok: false,
				next: check.next,
				reason: `Current phase ${state.phase} has blocking gate(s): ${check.reason}`,
			};
		}
	}
	return { ok: true, next: target };
}
