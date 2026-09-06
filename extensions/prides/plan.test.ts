import { describe, expect, it } from "vitest";
import { PHASE_ORDER } from "./phases.js";
import { generatePlan, type PhasePlan, renderPlanMarkdown } from "./plan.js";
import type { GateDef, GoalSpec, PRIDESState } from "./types.js";

function makeGoal(objective: string, criteria: string[]): GoalSpec {
	return { objective, successCriteria: criteria, setAt: 1 };
}

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
		description: "Code review sign-off",
		type: "manual",
	},
	{
		name: "linter",
		phase: "I",
		description: "Lint clean",
		type: "command",
		command: "npm run lint",
	},
	{
		name: "security",
		phase: "S",
		description: "Security audit",
		type: "command",
		command: "npm run audit:security",
	},
];

describe("generatePlan", () => {
	it("returns a PhasePlan entry for each phase in P→S order", () => {
		const s = makeState({ goal: makeGoal("Ship it", ["a", "b"]) });
		const plan = generatePlan(s, defs);
		expect(plan.length).toBe(PHASE_ORDER.length);
		expect(plan.map((p) => p.phase)).toEqual(["P", "R", "I", "D", "E", "S"]);
	});

	it("marks phases before the current phase as completed", () => {
		const s = makeState({
			phase: "I",
			goal: makeGoal("Ship", ["a"]),
		});
		const plan = generatePlan(s, defs);
		expect(plan.find((x) => x.phase === "P")!.status).toBe("completed");
		expect(plan.find((x) => x.phase === "R")!.status).toBe("completed");
		expect(plan.find((x) => x.phase === "I")!.status).toBe("current");
	});

	it("marks phases after the current as pending", () => {
		const s = makeState({
			phase: "I",
			goal: makeGoal("Ship", ["a"]),
		});
		const plan = generatePlan(s, defs);
		expect(plan.find((x) => x.phase === "D")!.status).toBe("pending");
		expect(plan.find((x) => x.phase === "S")!.status).toBe("pending");
	});

	it("lists gates for each phase based on the provided defs", () => {
		const s = makeState({
			phase: "P",
			goal: makeGoal("Ship", ["a"]),
		});
		const plan = generatePlan(s, defs);
		expect(plan.find((x) => x.phase === "R")!.gates.map((g) => g.name)).toEqual(
			["review"],
		);
		expect(plan.find((x) => x.phase === "I")!.gates.map((g) => g.name)).toEqual(
			["linter"],
		);
	});

	it("derives draft tasks from goal.successCriteria when no tasks exist", () => {
		const s = makeState({
			phase: "P",
			goal: makeGoal("Ship", [
				"POST /login returns 200",
				"POST /login returns 401",
			]),
		});
		const plan = generatePlan(s, defs);
		const impl = plan.find((x) => x.phase === "I")!;
		expect(impl.draftTasks.length).toBe(2);
		expect(impl.draftTasks[0]).toMatch(/POST \/login/);
	});

	it("preserves existing tasks when goal is set", () => {
		const s = makeState({
			phase: "I",
			goal: makeGoal("Ship", ["a"]),
			tasks: [
				{
					id: 1,
					description: "already known",
					status: "in_progress",
					phase: "I",
					createdAt: 1,
				},
			],
		});
		const plan = generatePlan(s, defs);
		const impl = plan.find((x) => x.phase === "I")!;
		expect(impl.existingTasks.length).toBe(1);
		expect(impl.draftTasks.length).toBe(0);
	});

	it("includes a drift checkpoint marker in critical phases", () => {
		const s = makeState({
			phase: "P",
			goal: makeGoal("Ship", ["a"]),
		});
		const plan = generatePlan(s, defs);
		for (const p of plan) {
			if (p.criticality === "critical") {
				expect(p.driftCheckpoint).toBe(true);
			} else {
				expect(p.driftCheckpoint).toBe(false);
			}
		}
	});

	it("plan total goal-criterion coverage counts criteria across draft tasks", () => {
		const s = makeState({
			phase: "P",
			goal: makeGoal("Ship", ["x", "y", "z"]),
		});
		const plan = generatePlan(s, defs);
		const covered = plan.reduce(
			(acc, p) => acc + p.draftTasks.length + p.existingTasks.length,
			0,
		);
		expect(covered).toBeGreaterThanOrEqual(3);
	});

	it("renders a markdown plan with phase headers, gates, tasks, drift checkpoints", () => {
		const s = makeState({
			phase: "I",
			goal: makeGoal("Ship", ["a"]),
		});
		const plan: PhasePlan[] = generatePlan(s, defs);
		const md = renderPlanMarkdown(plan, s);
		expect(md).toContain("# PRIDES Auto-Plan");
		expect(md).toMatch(/##\s+\[x\]\s+P\s+—\s+Prototype/);
		expect(md).toMatch(/##\s+\[x\]\s+R\s+—\s+Review/);
		expect(md).toMatch(/##\s+\[\*\]\s+I\s+—\s+Implement/);
		expect(md).toContain("drift checkpoint");
	});
});
