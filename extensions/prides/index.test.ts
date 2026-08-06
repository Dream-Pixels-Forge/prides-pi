import { describe, expect, it } from "vitest";
import { loadState, slimState } from "./index.js";
import { createInitialState } from "./state.js";
import type { PRIDESState } from "./types.js";

function pridesEntry(state: PRIDESState): unknown {
	return { type: "custom", customType: "prides-state", data: state };
}

function otherEntry(): unknown {
	return { type: "custom", customType: "other", data: { version: 1 } };
}

function ctxWith(entries: unknown[]): {
	sessionManager: { getBranch: () => unknown[] };
} {
	return { sessionManager: { getBranch: () => entries } };
}

describe("loadState", () => {
	it("returns the LATEST prides-state entry, not the oldest", () => {
		const older = createInitialState(() => 0);
		const newer = createInitialState(() => 0);
		newer.phase = "S";
		const ctx = ctxWith([pridesEntry(older), pridesEntry(newer)]);
		expect(loadState(ctx as never).phase).toBe("S");
	});

	it("ignores non-prides-state custom entries", () => {
		const newer = createInitialState(() => 0);
		newer.phase = "I";
		const ctx = ctxWith([otherEntry(), pridesEntry(newer)]);
		expect(loadState(ctx as never).phase).toBe("I");
	});

	it("falls back to a fresh initial state when none are present", () => {
		const ctx = ctxWith([otherEntry()]);
		expect(loadState(ctx as never).phase).toBe("P");
	});

	it("prefers the latest even when older entries are interleaved", () => {
		const first = createInitialState(() => 0);
		const middle = createInitialState(() => 0);
		middle.phase = "R";
		const last = createInitialState(() => 0);
		last.phase = "E";
		const ctx = ctxWith([
			pridesEntry(first),
			otherEntry(),
			pridesEntry(middle),
			pridesEntry(last),
		]);
		expect(loadState(ctx as never).phase).toBe("E");
	});

	describe("slimState", () => {
		it("returns the same reference when under the event cap", () => {
			const st = createInitialState(() => 0);
			expect(slimState(st)).toBe(st);
		});

		it("trims events to the most recent PERSIST_EVENT_CAP", () => {
			const st = createInitialState(() => 0);
			st.events = Array.from({ length: 80 }, (_, i) => ({
				kind: "heartbeat",
				phase: "P",
				at: i,
				message: String(i),
			})) as PRIDESState["events"];
			const out = slimState(st);
			expect(out.events.length).toBe(50);
			expect(out.events[0].message).toBe("30");
		});
	});
});
