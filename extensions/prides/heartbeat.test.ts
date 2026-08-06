import { describe, expect, it } from "vitest";
import {
	classifyPulse,
	intervalFor,
	isStalled,
	makePulse,
	nextPulseDue,
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

	it("computes next pulse due time", () => {
		const clock = { t: 500 };
		const s = createInitialState(() => clock.t);
		s.heartbeat = makePulse("I", "x", "HEALTHY", () => clock.t);
		expect(nextPulseDue(s)).toBe(500 + 30_000);
	});
});
