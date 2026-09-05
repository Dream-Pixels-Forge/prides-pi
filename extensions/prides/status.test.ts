import { describe, expect, it } from "vitest";
import { PHASE_ORDER } from "./phases.js";
import { buildStatus, type IssueCounts } from "./status.js";
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

const emptyCounts: IssueCounts = {
	issuesOpened: 0,
	issuesClosed: 0,
	prsOpened: 0,
	prsClosed: 0,
	prsMerged: 0,
};

describe("buildStatus", () => {
	it("returns a snapshot for a fresh state", () => {
		const s = makeState();
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.phase).toBe("P");
		expect(status.phaseName).toBe("Prototype");
		expect(status.phaseIndex).toBe(0);
		expect(status.phaseTotal).toBe(PHASE_ORDER.length);
		expect(status.phaseSequence).toBe("P→R→I→D→E→S");
		expect(status.phaseProgress).toBe("P (1/6)");
		expect(status.emergencyStop).toBe(false);
	});

	it("counts tasks open vs total", () => {
		const s = makeState({
			tasks: [
				{
					id: 1,
					description: "a",
					status: "completed",
					phase: "I",
					createdAt: 1,
				},
				{
					id: 2,
					description: "b",
					status: "in_progress",
					phase: "I",
					createdAt: 2,
				},
				{
					id: 3,
					description: "c",
					status: "pending",
					phase: "I",
					createdAt: 3,
				},
			],
		});
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.tasksOpen).toBe(2);
		expect(status.tasksTotal).toBe(3);
	});

	it("counts gates by status", () => {
		const s = makeState({
			gates: {
				review: {
					name: "review",
					phase: "R",
					status: "pending",
					message: "",
					ranAt: 1,
				},
				linter: {
					name: "linter",
					phase: "I",
					status: "pass",
					message: "",
					ranAt: 1,
				},
				security: {
					name: "security",
					phase: "S",
					status: "fail",
					message: "",
					ranAt: 1,
				},
			},
		});
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.gatesPass).toBe(1);
		expect(status.gatesFail).toBe(1);
		expect(status.gatesPending).toBe(1);
		expect(status.gatesTotal).toBe(3);
	});

	it("surfaces GitHub-style counts", () => {
		const counts: IssueCounts = {
			issuesOpened: 12,
			issuesClosed: 7,
			prsOpened: 4,
			prsClosed: 1,
			prsMerged: 3,
		};
		const s = makeState();
		const status = buildStatus(s, [], counts, () => 1000);
		expect(status.counts).toEqual(counts);
		expect(status.issuesOpen).toBe(5);
		// prsOpen = opened - closed (merged PRs are part of closed)
		expect(status.prsOpen).toBe(3);
		expect(status.counts.prsMerged).toBe(3);
	});

	it("computes drift severity from latest goal check", () => {
		const s = makeState({
			goal: {
				objective: "ship",
				successCriteria: ["a"],
				setAt: 1,
			},
			goalChecks: [
				{
					kind: "drift",
					aligned: false,
					driftScore: 0.6,
					reasoning: "off track",
					checkedAt: 1,
				},
			],
		});
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.driftScore).toBe(0.6);
		expect(status.driftSeverity).toBe("warn");
	});

	it("returns drift ok when no goal set", () => {
		const s = makeState();
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.driftScore).toBeNull();
		expect(status.driftSeverity).toBe("ok");
	});

	it("counts active warnings by severity", () => {
		const s = makeState({
			warnings: [
				{
					id: "a",
					severity: "error",
					category: "gate",
					message: "fail",
					createdAt: 1,
				},
				{
					id: "b",
					severity: "warn",
					category: "drift",
					message: "drift",
					createdAt: 1,
				},
				{
					id: "c",
					severity: "warn",
					category: "taxonomy",
					message: "old",
					createdAt: 1,
					resolvedAt: 100,
				},
			],
		});
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.warningsError).toBe(1);
		expect(status.warningsWarn).toBe(1);
		expect(status.warningsActive).toBe(2);
	});

	it("reports heartbeat age in milliseconds", () => {
		const s = makeState({
			heartbeat: {
				phase: "I",
				status: "HEALTHY",
				intent: "doing stuff",
				at: 500,
			},
		});
		const status = buildStatus(s, [], emptyCounts, () => 1500);
		expect(status.heartbeatAgeMs).toBe(1000);
		expect(status.heartbeatPresent).toBe(true);
	});

	it("produces widget lines suitable for a terminal widget", () => {
		const s = makeState({ phase: "I" });
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		const lines = status.widgetLines;
		expect(lines.length).toBeGreaterThan(0);
		// Progress bar must show the full sequence with current phase bracketed
		expect(lines.some((l) => l.includes("R → [I] → D"))).toBe(true);
		// Must contain the phase indicator
		expect(lines.some((l) => l.includes("[I]"))).toBe(true);
	});

	it("builds a phase progress bar string with the current phase highlighted", () => {
		const s = makeState({ phase: "R" });
		const status = buildStatus(s, [], emptyCounts, () => 1000);
		expect(status.progressBar).toContain("R");
		// Current phase should be visually distinguished (using brackets)
		expect(status.progressBar).toContain("[R]");
	});
});
