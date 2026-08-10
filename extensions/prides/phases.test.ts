import { describe, expect, it } from "vitest";
import { DEFAULT_GATES } from "./gates.js";
import {
	canAdvance,
	isValidPhase,
	nextPhase,
	PHASE_ORDER,
	validateSetPhase,
} from "./phases.js";
import { createInitialState } from "./state.js";
import type { GateResult, Phase, PRIDESState } from "./types.js";

describe("phases", () => {
	it("orders phases linearly P→R→I→D→E→S", () => {
		expect(PHASE_ORDER).toEqual(["P", "R", "I", "D", "E", "S"]);
		expect(nextPhase("P")).toBe("R");
		expect(nextPhase("S")).toBeNull();
	});

	it("validates phase strings", () => {
		expect(isValidPhase("I")).toBe(true);
		expect(isValidPhase("Z")).toBe(false);
	});

	it("allows advance from P with no gates", () => {
		const s = createInitialState(() => 0);
		expect(canAdvance(s, DEFAULT_GATES)).toEqual({ ok: true, next: "R" });
	});

	it("blocks advance at final phase", () => {
		const s = createInitialState(() => 0);
		s.phase = "S";
		expect(canAdvance(s, DEFAULT_GATES).ok).toBe(false);
	});

	it("blocks advance when a current-phase gate fails", () => {
		const s: PRIDESState = createInitialState(() => 0);
		s.phase = "I";
		const failing: GateResult = {
			name: "linter",
			phase: "I",
			status: "fail",
			message: "boom",
			ranAt: 0,
		};
		s.gates.linter = failing;
		const check = canAdvance(s, DEFAULT_GATES);
		expect(check.ok).toBe(false);
		expect(check.next).toBe("D");
	});

	it("blocks I→D when Implement-phase tasks are incomplete", () => {
		const s: PRIDESState = createInitialState(() => 0);
		s.phase = "I";
		// Add two tasks in Implement phase
		s.tasks = [
			{
				id: 1,
				description: "build auth",
				status: "completed",
				phase: "I",
				createdAt: 0,
			},
			{
				id: 2,
				description: "build API",
				status: "in_progress",
				phase: "I",
				createdAt: 0,
			},
		];
		s.nextTaskId = 3;
		const check = canAdvance(s, DEFAULT_GATES);
		expect(check.ok).toBe(false);
		expect(check.reason).toContain("100% task completion");
		expect(check.reason).toContain("#2");
	});

	it("allows I→D when all Implement-phase tasks are completed", () => {
		const s: PRIDESState = createInitialState(() => 0);
		s.phase = "I";
		s.tasks = [
			{
				id: 1,
				description: "build auth",
				status: "completed",
				phase: "I",
				createdAt: 0,
			},
			{
				id: 2,
				description: "build API",
				status: "completed",
				phase: "I",
				createdAt: 0,
			},
		];
		s.nextTaskId = 3;
		const check = canAdvance(s, DEFAULT_GATES);
		expect(check.ok).toBe(true);
		expect(check.next).toBe("D");
	});

	it("allows I→D with no tasks (empty task list is 100%)", () => {
		const s: PRIDESState = createInitialState(() => 0);
		s.phase = "I";
		const check = canAdvance(s, DEFAULT_GATES);
		expect(check.ok).toBe(true);
		expect(check.next).toBe("D");
	});

	it("does not block other phase transitions for incomplete tasks", () => {
		const s: PRIDESState = createInitialState(() => 0);
		s.phase = "P";
		s.tasks = [
			{
				id: 1,
				description: "prototype something",
				status: "pending",
				phase: "P",
				createdAt: 0,
			},
		];
		// P→R should NOT be blocked by incomplete P tasks
		const check = canAdvance(s, DEFAULT_GATES);
		expect(check.ok).toBe(true);
		expect(check.next).toBe("R");
	});

	it("validates set-phase and enforces current gates unless forced", () => {
		const s = createInitialState(() => 0);
		expect(validateSetPhase("R", s, DEFAULT_GATES, false).ok).toBe(true);
		expect(validateSetPhase("Z" as Phase, s, DEFAULT_GATES, false).ok).toBe(
			false,
		);

		s.phase = "I";
		s.gates.linter = {
			name: "linter",
			phase: "I",
			status: "fail",
			message: "x",
			ranAt: 0,
		};
		expect(validateSetPhase("S", s, DEFAULT_GATES, false).ok).toBe(false);
		expect(validateSetPhase("S", s, DEFAULT_GATES, true).ok).toBe(true);
	});
});
