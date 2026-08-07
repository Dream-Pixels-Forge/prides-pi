import { describe, expect, it } from "vitest";
import { createInitialState, recordEvent } from "./state.js";

describe("state", () => {
	it("creates a fresh state in phase P", () => {
		const s = createInitialState(() => 0);
		expect(s.phase).toBe("P");
		expect(s.nextTaskId).toBe(1);
		expect(s.emergencyStop).toBe(false);
		expect(s.events).toEqual([]);
	});

	it("appends audit events immutably", () => {
		let s = createInitialState(() => 0);
		s = recordEvent(
			s,
			{ kind: "phase_advance", phase: "R", message: "P→R" },
			() => 0,
		);
		expect(s.events).toHaveLength(1);
		expect(s.events[0].message).toBe("P→R");
	});

	it("caps the audit trail at 200 events", () => {
		let s = createInitialState(() => 0);
		for (let i = 0; i < 250; i++) {
			s = recordEvent(
				s,
				{ kind: "heartbeat", phase: "P", message: `h${i}` },
				() => i,
			);
		}
		expect(s.events).toHaveLength(200);
		expect(s.events[0].message).toBe("h50"); // oldest 50 dropped
	});
});
