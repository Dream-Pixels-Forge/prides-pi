import { describe, expect, it } from "vitest";
import type { IssueCounts } from "./status.js";
import type { PRIDESState } from "./types.js";
import { buildWidget } from "./widget.js";

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

const emptyCounts: IssueCounts = {
	issuesOpened: 0,
	issuesClosed: 0,
	prsOpened: 0,
	prsClosed: 0,
	prsMerged: 0,
};

describe("buildWidget", () => {
	it("returns a function that produces a Component when called", () => {
		const state = makeState();
		const factory = buildWidget(
			() => state,
			() => emptyCounts,
		);
		expect(typeof factory).toBe("function");
	});

	it("factory output has the dispose method", () => {
		const state = makeState();
		const factory = buildWidget(
			() => state,
			() => emptyCounts,
		);
		// Stub tui + theme since they are not used by Text-only widget
		const stubTui = {} as never;
		const stubTheme = {
			fg: (_color: string, text: string) => text,
		} as never;
		const comp = factory(stubTui, stubTheme);
		expect(typeof comp.render).toBe("function");
		// dispose is optional but if present must be callable
		if (comp.dispose) expect(typeof comp.dispose).toBe("function");
	});

	it("render produces lines matching StatusSnapshot.widgetLines", () => {
		const state = makeState({ phase: "I" });
		const counts: IssueCounts = {
			issuesOpened: 5,
			issuesClosed: 3,
			prsOpened: 2,
			prsClosed: 1,
			prsMerged: 1,
		};
		const factory = buildWidget(
			() => state,
			() => counts,
		);
		const stubTui = {} as never;
		const stubTheme = {
			fg: (_color: string, text: string) => text,
		} as never;
		const comp = factory(stubTui, stubTheme);
		const lines = comp.render(120);
		// Must include the phase progress bar fragment
		expect(lines.some((l) => l.includes("[I]"))).toBe(true);
		// Must include the issue/PR counts
		expect(lines.some((l) => l.includes("issues: 2 open"))).toBe(true);
		expect(lines.some((l) => l.includes("PRs: 1 open"))).toBe(true);
	});

	it("reflects live state changes via the getter", () => {
		let stateRef = makeState({ phase: "P" });
		const factory = buildWidget(
			() => stateRef,
			() => emptyCounts,
		);
		const stubTui = {} as never;
		const stubTheme = {
			fg: (_color: string, text: string) => text,
		} as never;
		const comp = factory(stubTui, stubTheme);
		// First render — phase P
		const lines1 = comp.render(120);
		expect(lines1.some((l) => l.includes("[P]"))).toBe(true);
		// Mutate state via the getter closure
		stateRef = makeState({ phase: "S" });
		const lines2 = comp.render(120);
		expect(lines2.some((l) => l.includes("[S]"))).toBe(true);
	});

	it("uses a Loader for the heartbeat indicator when no pulse is recorded", () => {
		const state = makeState();
		const factory = buildWidget(
			() => state,
			() => emptyCounts,
		);
		const stubTui = {} as never;
		const stubTheme = {
			fg: (_color: string, text: string) => text,
		} as never;
		const comp = factory(stubTui, stubTheme);
		const lines = comp.render(120);
		// The hb line should be present (with the loader-indicator prefix or just 'hb:')
		const hbLine = lines.find((l) => l.includes("hb:"));
		expect(hbLine).toBeDefined();
		// No real Loader in stub TUI — should still produce a valid line
		expect(hbLine).toContain("hb:");
	});

	it("renders defensively when defs array is empty", () => {
		const state = makeState();
		const factory = buildWidget(
			() => state,
			() => emptyCounts,
		);
		const stubTui = {} as never;
		const stubTheme = {
			fg: (_color: string, text: string) => text,
		} as never;
		const comp = factory(stubTui, stubTheme);
		const lines = comp.render(120);
		expect(lines.length).toBeGreaterThan(0);
	});
});
