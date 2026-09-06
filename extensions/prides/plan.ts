/**
 * pi-prides — Goal-enforced planning
 *
 * Pure functions that build a phase-by-phase implementation plan from the
 * project goal and the current state. The plan drives `dev_notes/PLAN_AUTO.md`
 * so the agent has a written reference for what each phase must produce.
 */

import { PHASE_CONFIG, PHASE_ORDER } from "./phases.js";
import type { GateDef, PRIDESState } from "./types.js";

export interface PhasePlan {
	phase: PRIDESState["phase"];
	phaseName: string;
	criticality: string;
	status: "completed" | "current" | "pending";
	heartbeatMs: number;
	gates: Array<{ name: string; type: GateDef["type"]; description: string }>;
	existingTasks: Array<{ id: number; description: string; status: string }>;
	draftTasks: string[];
	driftCheckpoint: boolean;
}

/** Build the plan from current state + gate defs. Pure. */
export function generatePlan(state: PRIDESState, defs: GateDef[]): PhasePlan[] {
	const currentIdx = PHASE_ORDER.indexOf(state.phase);
	const goal = state.goal;
	const goalCriteria = goal?.successCriteria ?? [];

	return PHASE_ORDER.map((phase, idx) => {
		const cfg = PHASE_CONFIG[phase];
		const phaseGates = defs
			.filter((d) => d.phase === phase)
			.map((d) => ({ name: d.name, type: d.type, description: d.description }));

		const existingTasks = state.tasks
			.filter((t) => t.phase === phase)
			.map((t) => ({
				id: t.id,
				description: t.description,
				status: t.status,
			}));

		// Derive draft tasks: in the implement phase, every uncovered
		// success-criterion becomes a draft task. In other phases we
		// produce one "verify X" task per criterion as a checkpoint.
		const draftTasks: string[] = [];
		const coveredCriteria = new Set(
			existingTasks.map((t) => t.description.toLowerCase()),
		);
		for (const c of goalCriteria) {
			const isCovered = [...coveredCriteria].some((cc) =>
				cc.includes(c.toLowerCase()),
			);
			if (isCovered) continue;
			if (phase === "I") {
				draftTasks.push(`Implement: ${c}`);
			} else if (phase === "D") {
				draftTasks.push(`Deploy verification: ${c}`);
			} else if (phase === "S") {
				draftTasks.push(`Secure review: ${c}`);
			}
		}

		const status: PhasePlan["status"] =
			idx < currentIdx
				? "completed"
				: idx === currentIdx
					? "current"
					: "pending";

		return {
			phase,
			phaseName: cfg.name,
			criticality: cfg.criticality,
			status,
			heartbeatMs: cfg.heartbeatMs,
			gates: phaseGates,
			existingTasks,
			draftTasks,
			driftCheckpoint: cfg.criticality === "critical",
		};
	});
}

/** Render the plan as a markdown document suitable for `dev_notes/PLAN_AUTO.md`. */
export function renderPlanMarkdown(
	plan: PhasePlan[],
	state: PRIDESState,
): string {
	const lines: string[] = [];
	lines.push("# PRIDES Auto-Plan");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(
		`Current phase: ${state.phase} (${PHASE_CONFIG[state.phase].name})`,
	);
	if (state.goal) {
		lines.push(`Goal: ${state.goal.objective}`);
		lines.push(
			`Success criteria (${state.goal.successCriteria.length}): ${state.goal.successCriteria.join("; ")}`,
		);
		if (state.goal.nonGoals?.length) {
			lines.push(`Non-goals: ${state.goal.nonGoals.join("; ")}`);
		}
		if (state.goal.constraints?.length) {
			lines.push(`Constraints: ${state.goal.constraints.join("; ")}`);
		}
	} else {
		lines.push("Goal: (not yet set — call prides_goal_set)");
	}
	lines.push("");

	for (const p of plan) {
		const marker =
			p.status === "completed" ? "[x]" : p.status === "current" ? "[*]" : "[ ]";
		lines.push(`## ${marker} ${p.phase} — ${p.phaseName} (${p.criticality})`);
		lines.push(`Heartbeat interval: ${p.heartbeatMs}ms`);
		if (p.driftCheckpoint) {
			lines.push(
				`**drift checkpoint** — this is a critical phase; prides_goal_check runs on every task add`,
			);
		}
		if (p.gates.length > 0) {
			lines.push("");
			lines.push("Gates:");
			for (const g of p.gates) {
				lines.push(`  - \`${g.name}\` (${g.type}) — ${g.description}`);
			}
		} else {
			lines.push("");
			lines.push("Gates: (none defined for this phase)");
		}
		if (p.existingTasks.length > 0) {
			lines.push("");
			lines.push("Existing tasks:");
			for (const t of p.existingTasks) {
				lines.push(`  - #${t.id} [${t.status}] ${t.description}`);
			}
		}
		if (p.draftTasks.length > 0) {
			lines.push("");
			lines.push("Draft tasks (derived from goal):");
			for (const d of p.draftTasks) lines.push(`  - ${d}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}
