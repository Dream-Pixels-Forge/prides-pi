/**
 * pi-prides — Status snapshot + widget rendering
 *
 * Pure functions that build a structured status snapshot from the live state.
 * No I/O, no host dependencies. The widget factory (`./widget.ts`) uses these
 * to render an animated terminal widget.
 */

import { PHASE_CONFIG, PHASE_ORDER } from "./phases.js";
import type { GateDef, PRIDESState } from "./types.js";

/** GitHub-style counts (sourced from a local counts.json file or gh CLI later). */
export interface IssueCounts {
	issuesOpened: number;
	issuesClosed: number;
	prsOpened: number;
	prsClosed: number;
	prsMerged: number;
}

export type DriftSeverity = "ok" | "warn" | "stop";

/** Structured status snapshot — drives both `prides_status` tool output AND the widget. */
export interface StatusSnapshot {
	phase: PRIDESState["phase"];
	phaseName: string;
	phaseIndex: number;
	phaseTotal: number;
	phaseSequence: string; // "P→R→I→D→E→S"
	phaseProgress: string; // "R (2/6)"
	emergencyStop: boolean;

	tasksOpen: number;
	tasksTotal: number;

	gatesPass: number;
	gatesFail: number;
	gatesPending: number;
	gatesTotal: number;
	gatesBlockingNames: string[];

	heartbeatPresent: boolean;
	heartbeatAgeMs: number | null;
	heartbeatStatus: PRIDESState["heartbeat"] extends infer H
		? H extends { status: infer S }
			? S
			: null
		: null;

	warningsError: number;
	warningsWarn: number;
	warningsActive: number;

	driftScore: number | null;
	driftSeverity: DriftSeverity;

	counts: IssueCounts;
	issuesOpen: number; // issuesOpened - issuesClosed
	prsOpen: number; // prsOpened - prsClosed

	progressBar: string; // e.g. "P [R] → I → D → E → S"
	widgetLines: string[];
}

/** Compute drift severity from score, using the same thresholds as goal.ts. */
export function computeDriftSeverity(score: number | null): DriftSeverity {
	if (score === null) return "ok";
	if (score >= 0.85) return "stop";
	if (score >= 0.5) return "warn";
	return "ok";
}

/** Build a phase progress bar with the current phase bracketed. */
export function buildProgressBar(current: PRIDESState["phase"]): string {
	const parts = PHASE_ORDER.map((p) => (p === current ? `[${p}]` : p));
	return parts.join(" → ");
}

/** Names of gates currently blocking advancement. */
export function blockingGateNames(
	state: PRIDESState,
	defs: GateDef[],
): string[] {
	const out: string[] = [];
	for (const def of defs.filter((d) => d.phase === state.phase)) {
		const r = state.gates[def.name];
		if (!r) {
			if (def.type === "manual") out.push(def.name);
			continue;
		}
		if (r.status === "fail") out.push(def.name);
		else if (r.status === "pending" && def.type === "manual")
			out.push(def.name);
	}
	return out;
}

/**
 * Build a full status snapshot from current state + gate defs + counts + clock.
 * Pure — no side effects, easy to unit-test.
 */
export function buildStatus(
	state: PRIDESState,
	defs: GateDef[],
	counts: IssueCounts,
	now: () => number,
): StatusSnapshot {
	const phaseIndex = PHASE_ORDER.indexOf(state.phase);
	const phaseTotal = PHASE_ORDER.length;
	const phaseName = PHASE_CONFIG[state.phase].name;

	const tasksOpen = state.tasks.filter((t) => t.status !== "completed").length;
	const tasksTotal = state.tasks.length;

	const gates = Object.values(state.gates);
	const gatesPass = gates.filter((g) => g.status === "pass").length;
	const gatesFail = gates.filter((g) => g.status === "fail").length;
	const gatesPending = gates.filter((g) => g.status === "pending").length;
	const gatesTotal = gates.length;
	const gatesBlockingNames = blockingGateNames(state, defs);

	const warningsActive = state.warnings.filter((w) => !w.resolvedAt);
	const warningsError = warningsActive.filter(
		(w) => w.severity === "error",
	).length;
	const warningsWarn = warningsActive.filter(
		(w) => w.severity === "warn",
	).length;

	const heartbeatPresent = state.heartbeat !== null;
	const heartbeatAgeMs = state.heartbeat ? now() - state.heartbeat.at : null;
	const heartbeatStatus = state.heartbeat?.status ?? null;

	const lastDrift = state.goalChecks.length
		? state.goalChecks[state.goalChecks.length - 1]
		: null;
	const driftScore = lastDrift ? lastDrift.driftScore : null;
	const driftSeverity = computeDriftSeverity(driftScore);

	const issuesOpen = counts.issuesOpened - counts.issuesClosed;
	// Merged PRs are a subset of closed PRs, so "open PRs" = opened - closed
	const prsOpen = counts.prsOpened - counts.prsClosed;

	const progressBar = buildProgressBar(state.phase);
	const phaseProgress = `${state.phase} (${phaseIndex + 1}/${phaseTotal})`;

	const widgetLines = renderWidgetLines({
		phase: state.phase,
		phaseName,
		phaseProgress,
		progressBar,
		emergencyStop: state.emergencyStop,
		tasksOpen,
		tasksTotal,
		gatesPass,
		gatesFail,
		gatesPending,
		gatesTotal,
		gatesBlockingNames,
		heartbeatPresent,
		heartbeatAgeMs,
		heartbeatStatus,
		warningsError,
		warningsWarn,
		driftScore,
		driftSeverity,
		issuesOpen,
		counts,
		prsOpen,
	});

	return {
		phase: state.phase,
		phaseName,
		phaseIndex,
		phaseTotal,
		phaseSequence: PHASE_ORDER.join("→"),
		phaseProgress,
		emergencyStop: state.emergencyStop,
		tasksOpen,
		tasksTotal,
		gatesPass,
		gatesFail,
		gatesPending,
		gatesTotal,
		gatesBlockingNames,
		heartbeatPresent,
		heartbeatAgeMs,
		heartbeatStatus,
		warningsError,
		warningsWarn,
		warningsActive: warningsActive.length,
		driftScore,
		driftSeverity,
		counts,
		issuesOpen,
		prsOpen,
		progressBar,
		widgetLines,
	};
}

function fmtAge(ms: number | null): string {
	if (ms === null) return "—";
	if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
	if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
	return `${Math.floor(ms / 3_600_000)}h`;
}

function renderWidgetLines(s: {
	phase: PRIDESState["phase"];
	phaseName: string;
	phaseProgress: string;
	progressBar: string;
	emergencyStop: boolean;
	tasksOpen: number;
	tasksTotal: number;
	gatesPass: number;
	gatesFail: number;
	gatesPending: number;
	gatesTotal: number;
	gatesBlockingNames: string[];
	heartbeatPresent: boolean;
	heartbeatAgeMs: number | null;
	heartbeatStatus: StatusSnapshot["heartbeatStatus"];
	warningsError: number;
	warningsWarn: number;
	driftScore: number | null;
	driftSeverity: DriftSeverity;
	issuesOpen: number;
	counts: IssueCounts;
	prsOpen: number;
}): string[] {
	const lines: string[] = [];
	const stopTag = s.emergencyStop ? "  ⛔ STOP" : "";
	lines.push(
		`PRIDES ${s.phase} · ${s.phaseName}${stopTag}  (${s.phaseProgress})`,
	);
	lines.push(s.progressBar);

	const hbTag = s.heartbeatPresent
		? `${s.heartbeatStatus ?? "?"} (${fmtAge(s.heartbeatAgeMs)} ago)`
		: "—";
	lines.push(
		`tasks: ${s.tasksOpen}/${s.tasksTotal} open · gates: ${s.gatesPass}/${s.gatesTotal} pass` +
			(s.gatesFail > 0 ? ` (${s.gatesFail} fail)` : "") +
			(s.gatesPending > 0 ? ` (${s.gatesPending} pending)` : "") +
			` · hb: ${hbTag}`,
	);

	const driftTag =
		s.driftScore === null
			? "goal: —"
			: `goal: drift ${s.driftScore.toFixed(2)} (${s.driftSeverity})`;
	lines.push(
		`issues: ${s.issuesOpen} open · PRs: ${s.prsOpen} open · ${driftTag}`,
	);

	if (s.warningsError > 0 || s.warningsWarn > 0) {
		const parts: string[] = [];
		if (s.warningsError > 0) parts.push(`${s.warningsError} error(s)`);
		if (s.warningsWarn > 0) parts.push(`${s.warningsWarn} warning(s)`);
		lines.push(`⚠ ${parts.join(" · ")} — commit/push blocked`);
	}

	if (s.gatesBlockingNames.length > 0) {
		lines.push(`blocking: ${s.gatesBlockingNames.join(", ")}`);
	}

	return lines;
}
