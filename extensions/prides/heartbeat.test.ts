import { describe, expect, it } from "vitest";
import {
	assessStaleness,
	classifyPulse,
	intervalFor,
	isStalled,
	makePulse,
	stalledReason,
} from "./heartbeat.js";
import { createInitialState } from "./state.js";

describe("heartbeat", () => {
	it("returns the configured interval per phase", () => {
		expect(intervalFor("I")).toBe(30_000);
		expect(intervalFor("E")).toBe(300_000);
	});

	it("classifies pulse gaps", () => {
		expect(classifyPulse(10_000, "I")).toBe("HEALTHY"); // < interval
		expect(classifyPulse(40_000, "I")).toBe("DRIFTING"); // 1x..2x
		expect(classifyPulse(70_000, "I")).toBe("STALLED"); // > 2x
	});

	it("flags staleness when double the interval elapses", () => {
		const clock = { t: 1_000_000 };
		const s = createInitialState(() => clock.t);
		s.heartbeat = makePulse("I", "working", "HEALTHY", () => clock.t);
		expect(isStalled(s, () => clock.t)).toBe(false);
		clock.t += 70_000; // > 2x 30s
		expect(isStalled(s, () => clock.t)).toBe(true);
	});

	it("assessStaleness returns task context when stalled", () => {
		const clock = { t: 1_000_000 };
		const s = createInitialState(() => clock.t);
		s.phase = "I";
		s.heartbeat = makePulse("I", "working", "HEALTHY", () => clock.t);
		s.tasks = [
			{ id: 1, description: "task1", status: "completed", phase: "I", createdAt: 0 },
			{ id: 2, description: "task2", status: "in_progress", phase: "I", createdAt: 0 },
			{ id: 3, description: "task3", status: "pending", phase: "I", createdAt: 0 },
		];

		// Not stalled yet
		let ctx = assessStaleness(s, () => clock.t);
		expect(ctx.stalled).toBe(false);
		expect(ctx.incompleteTaskCount).toBe(2);
		expect(ctx.incompleteTaskIds).toEqual([2, 3]);

		// Now stalled (> 2x 30s = 60s)
		clock.t += 70_000;
		ctx = assessStaleness(s, () => clock.t);
		expect(ctx.stalled).toBe(true);
		expect(ctx.incompleteTaskCount).toBe(2);
	});

	it("stalledReason includes task IDs when stalled with incomplete tasks", () => {
		const clock = { t: 1_000_000 };
		const s = createInitialState(() => clock.t);
		s.phase = "I";
		s.heartbeat = makePulse("I", "working", "HEALTHY", () => clock.t);
		s.tasks = [
			{ id: 5, description: "task5", status: "pending", phase: "I", createdAt: 0 },
			{ id: 7, description: "task7", status: "in_progress", phase: "I", createdAt: 0 },
		];

		// Not stalled → no reason
		expect(stalledReason(s, () => clock.t)).toBeNull();

		// Stalled → reason with task IDs
		clock.t += 70_000;
		const reason = stalledReason(s, () => clock.t);
		expect(reason).not.toBeNull();
		expect(reason).toContain("#5");
		expect(reason).toContain("#7");
		expect(reason).toContain("2 incomplete");
	});

	it("stalledReason omits task info when no incomplete tasks", () => {
		const clock = { t: 1_000_000 };
		const s = createInitialState(() => clock.t);
		s.phase = "I";
		s.heartbeat = makePulse("I", "working", "HEALTHY", () => clock.t);
		s.tasks = [
			{ id: 1, description: "done", status: "completed", phase: "I", createdAt: 0 },
		];

		clock.t += 70_000;
		const reason = stalledReason(s, () => clock.t);
		expect(reason).not.toBeNull();
		expect(reason).toContain("stalled");
		expect(reason).not.toContain("incomplete");
	});
});
