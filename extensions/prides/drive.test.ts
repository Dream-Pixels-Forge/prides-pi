import { describe, expect, it } from "vitest";
import { type DriveAction, nextAction } from "./drive.js";
import type { GateDef, PRIDESState } from "./types.js";

function makeState(overrides: Partial<PRIDESState> = {}): PRIDESState {
	return {
		version: 1,
		phase: "P",
		phaseEnteredAt: 1000,
		tasks: [],
		nextTaskId: 1,
		gates: {},
		heartbeat: null,
		emergencyStop: false,
		artifacts: [],
		events: [],
		intent: undefined,
		goal: undefined,
		goalChecks: [],
		git: undefined,
		warnings: [],
		...overrides,
	};
}

const defs: GateDef[] = [
	{
		name: "review",
		phase: "R",
		description: "Review",
		type: "manual",
	},
	{
		name: "linter",
		phase: "I",
		description: "Lint",
		type: "command",
		command: "npm run lint",
	},
];

describe("nextAction", () => {
	it("recommends scaffold when intent is missing", () => {
		const s = makeState();
		const a: DriveAction = nextAction(s, defs);
		expect(a.kind).toBe("scaffold");
		expect(a.tool).toBe("prides_scaffold");
	});

	it("recommends set_goal when intent is set but goal is missing", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("set_goal");
		expect(a.tool).toBe("prides_goal_set");
	});

	it("recommends plan when goal is set but plan is missing", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("plan");
		expect(a.tool).toBe("prides_plan");
	});

	it("recommends run_gates when in implement with open tasks", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			phase: "I",
			tasks: [
				{
					id: 1,
					description: "build",
					status: "in_progress",
					phase: "I",
					createdAt: 1,
				},
			],
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("run_gates");
		expect(a.tool).toBe("prides_gates");
	});

	it("recommends heartbeat when stale and no task activity", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			phase: "I",
			heartbeat: {
				phase: "I",
				status: "HEALTHY",
				intent: "old work",
				at: 1,
			},
			goalChecks: [
				{
					kind: "drift",
					aligned: true,
					driftScore: 0.1,
					reasoning: "ok",
					checkedAt: 1,
				},
			],
		});
		// No tasks, old heartbeat, in critical phase
		const a = nextAction(s, defs, () => 10_000_000);
		expect(["heartbeat", "run_gates"]).toContain(a.kind);
	});

	it("recommends acknowledge_drift when an unacknowledged warning exists", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			warnings: [
				{
					id: "w-1",
					severity: "warn",
					category: "goal-drift",
					message: "off track",
					createdAt: 1,
				},
			],
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("acknowledge_drift");
		expect(a.tool).toBe("prides_drift_ack");
	});

	it("recommends verify_goal when entering S or advancing I→D", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			phase: "I",
			tasks: [],
		});
		// Pretend gates have passed by injecting pass results
		s.gates = {
			linter: {
				name: "linter",
				phase: "I",
				status: "pass",
				message: "ok",
				ranAt: 1,
			},
		};
		const a = nextAction(s, defs);
		expect(a.kind).toBe("verify_goal");
		expect(a.tool).toBe("prides_goal_verify");
	});

	it("recommends advance when all gates pass and I→D preconditions met", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			phase: "I",
			gates: {
				linter: {
					name: "linter",
					phase: "I",
					status: "pass",
					message: "ok",
					ranAt: 1,
				},
			},
			goalChecks: [
				{
					kind: "verify",
					aligned: true,
					driftScore: 0.1,
					reasoning: "all criteria met",
					checkedAt: 1000,
				},
			],
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("advance");
		expect(a.tool).toBe("prides_phase_advance");
	});

	it("recommends complete when at final phase with all gates pass", () => {
		const s = makeState({
			intent: { name: "x", purpose: "y" },
			goal: { objective: "ship", successCriteria: ["a"], setAt: 1 },
			planGeneratedAt: 1000,
			phase: "S",
		});
		const a = nextAction(s, defs);
		expect(a.kind).toBe("complete");
	});

	it("returns a JSON-serializable action", () => {
		const s = makeState();
		const a = nextAction(s, defs);
		const round = JSON.parse(JSON.stringify(a));
		expect(round.kind).toBe(a.kind);
		expect(JSON.stringify(a)).not.toContain("undefined");
	});

	it("includes reasoning for every recommendation", () => {
		const s = makeState();
		const a = nextAction(s, defs);
		expect(a.reasoning.length).toBeGreaterThan(0);
	});

	it("recommends emergency_stop_resume when emergency is active", () => {
		const s = makeState({ emergencyStop: true });
		const a = nextAction(s, defs);
		expect(a.kind).toBe("emergency_resume");
		expect(a.tool).toBe("prides_emergency_resume");
	});
});
