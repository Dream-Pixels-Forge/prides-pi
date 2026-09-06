import { describe, expect, it } from "vitest";
import { buildHandoff, type Handoff } from "./handoff.js";
import type { PRIDESState } from "./types.js";

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

describe("buildHandoff", () => {
	it("returns a Handoff object with primary skill and rationale", () => {
		const s = makeState();
		const h = buildHandoff(s);
		expect(h.primarySkill).toMatch(/prides-/);
		expect(h.rationale.length).toBeGreaterThan(0);
		expect(Array.isArray(h.crossReferences)).toBe(true);
	});

	it("routes emergency stop to prides-secure", () => {
		const s = makeState({ emergencyStop: true });
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-secure");
		expect(h.rationale).toMatch(/emergency/i);
	});

	it("routes stall to prides-heartbeat", () => {
		const s = makeState({
			heartbeat: {
				phase: "I",
				status: "STALLED",
				intent: "doing",
				at: 1000,
			},
			phase: "I",
		});
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-heartbeat");
	});

	it("routes phase R to prides-review", () => {
		const s = makeState({ phase: "R" });
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-review");
	});

	it("routes phase I with failing gate to prides-gate-loop", () => {
		const s = makeState({
			phase: "I",
			gates: {
				linter: {
					name: "linter",
					phase: "I",
					status: "fail",
					message: "errors",
					ranAt: 1,
				},
			},
		});
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-gate-loop");
	});

	it("routes phase D to prides-deploy", () => {
		const s = makeState({ phase: "D" });
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-deploy");
	});

	it("routes phase S to prides-secure or prides-cybersec", () => {
		const s = makeState({ phase: "S" });
		const h = buildHandoff(s);
		expect(h.primarySkill).toMatch(/prides-(secure|cybersec)/);
	});

	it("routes phase P with no intent to prides-init", () => {
		const s = makeState();
		const h = buildHandoff(s);
		expect(h.primarySkill).toBe("prides-init");
	});

	it("includes cross-references to agentic-workflow skills", () => {
		const s = makeState();
		const h: Handoff = buildHandoff(s);
		expect(h.crossReferences.length).toBeGreaterThanOrEqual(3);
		const ids = h.crossReferences.map((x) => x.skill);
		expect(ids).toContain("pipeline-orchestrator");
		expect(ids).toContain("dpf-agentic-engineer");
		expect(ids).toContain("test-driven-development");
	});

	it("includes a recommended next action", () => {
		const s = makeState();
		const h = buildHandoff(s);
		expect(h.nextAction.length).toBeGreaterThan(0);
		expect(h.nextAction).toMatch(/prides_/);
	});

	it("returns JSON-serializable handoff (no undefined leaks)", () => {
		const s = makeState({ goal: undefined, driftAck: undefined });
		const h = buildHandoff(s);
		const round = JSON.parse(JSON.stringify(h));
		expect(round.primarySkill).toBe(h.primarySkill);
		expect(JSON.stringify(h)).not.toContain("undefined");
	});
});
