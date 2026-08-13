import { describe, expect, it } from "vitest";
import {
	buildDriftPrompt,
	buildVerifyPrompt,
	driftSeverity,
	lastGoalCheck,
	parseGoalVerdict,
	recordGoalCheck,
	shouldRunDriftCheck,
	summarizeRecentActivity,
} from "./goal.js";
import type { GoalCheckResult, GoalSpec, PRIDESState } from "./types.js";

function makeState(overrides: Partial<PRIDESState> = {}): PRIDESState {
	const now = Date.now();
	const base: PRIDESState = {
		version: 1,
		phase: "I",
		phaseEnteredAt: now - 60_000,
		tasks: [],
		nextTaskId: 1,
		gates: {},
		heartbeat: null,
		emergencyStop: false,
		artifacts: [],
		events: [],
		warnings: [],
		goalChecks: [],
		...overrides,
	};
	return base;
}

const clock = { t: 1_700_000_000_000 };

const sampleGoal: GoalSpec = {
	objective: "Build auth middleware",
	successCriteria: [
		"POST /login returns 200 with valid creds",
		"POST /login returns 401 with invalid creds",
	],
	nonGoals: ["OAuth providers", "password reset"],
	constraints: ["no new dependencies", "do not touch billing/"],
	setAt: clock.t - 1000,
};

describe("goal", () => {
	describe("summarizeRecentActivity", () => {
		it("respects window cutoff", () => {
			const s = makeState({
				events: [
					{ kind: "task_add", phase: "I", at: clock.t - 20_000, message: "t1" },
					{ kind: "task_add", phase: "I", at: clock.t - 5_000, message: "t2" },
				],
			});
			const text = summarizeRecentActivity(s, clock.t, 10_000);
			expect(text).toContain("t2");
			expect(text).not.toContain("t1");
		});

		it("returns empty-state fallback", () => {
			const s = makeState({ events: [] });
			const text = summarizeRecentActivity(s, clock.t);
			expect(text).toBe("(no recent activity recorded)");
		});

		it("appends heartbeat intent when present", () => {
			const s = makeState({
				events: [],
				heartbeat: {
					phase: "I",
					status: "HEALTHY",
					intent: "writing tests",
					at: clock.t - 1000,
				},
			});
			const text = summarizeRecentActivity(s, clock.t);
			expect(text).toContain("[heartbeat] intent: writing tests");
		});
	});

	describe("buildDriftPrompt", () => {
		it("omits empty optional sections cleanly", () => {
			const goal: GoalSpec = {
				objective: "Build X",
				successCriteria: ["X works"],
				setAt: clock.t,
			};
			const prompt = buildDriftPrompt(goal, "activity");
			expect(prompt).not.toContain("Non-goals");
			expect(prompt).not.toContain("Constraints");
		});

		it("includes non-goals and constraints when present", () => {
			const prompt = buildDriftPrompt(sampleGoal, "activity");
			expect(prompt).toContain("Non-goals (explicitly out of scope)");
			expect(prompt).toContain("OAuth providers");
			expect(prompt).toContain("Constraints");
			expect(prompt).toContain("no new dependencies");
		});
	});

	describe("buildVerifyPrompt", () => {
		it("lists each success criterion as a checklist", () => {
			const prompt = buildVerifyPrompt(sampleGoal, "evidence");
			expect(prompt).toContain("- POST /login returns 200 with valid creds");
			expect(prompt).toContain("- POST /login returns 401 with invalid creds");
		});
	});

	describe("parseGoalVerdict", () => {
		it("maps judge pass/fail correctly", () => {
			const pass = parseGoalVerdict(
				"drift",
				{ status: "pass", message: "ok" },
				() => clock.t,
			);
			expect(pass.aligned).toBe(true);
			expect(pass.driftScore).toBe(0);

			const fail = parseGoalVerdict(
				"drift",
				{ status: "fail", message: "off track" },
				() => clock.t,
			);
			expect(fail.aligned).toBe(false);
			expect(fail.driftScore).toBe(1);
		});

		it("defaults score when judge omits it", () => {
			const pass = parseGoalVerdict(
				"verify",
				{ status: "pass", message: "all good" },
				() => clock.t,
			);
			expect(pass.driftScore).toBe(0);

			const fail = parseGoalVerdict(
				"verify",
				{ status: "fail", message: "missing criteria" },
				() => clock.t,
			);
			expect(fail.driftScore).toBe(1);
		});

		it("uses explicit score when provided", () => {
			const r = parseGoalVerdict(
				"drift",
				{ status: "fail", message: "drifting", score: 0.6 },
				() => clock.t,
			);
			expect(r.driftScore).toBe(0.6);
		});
	});

	describe("recordGoalCheck", () => {
		it("caps at MAX_GOAL_CHECKS (50)", () => {
			const s = makeState({ goalChecks: [] });
			const checks: GoalCheckResult[] = [];
			let current = s;
			for (let i = 0; i < 55; i++) {
				const check: GoalCheckResult = {
					kind: "drift",
					aligned: true,
					driftScore: 0,
					reasoning: `check ${i}`,
					checkedAt: clock.t + i,
				};
				checks.push(check);
				current = recordGoalCheck(current, check);
			}
			expect(current.goalChecks.length).toBe(50);
			expect(current.goalChecks[0].reasoning).toBe("check 5");
			expect(current.goalChecks[49].reasoning).toBe("check 54");
		});
	});

	describe("lastGoalCheck", () => {
		it("returns null when empty", () => {
			const s = makeState({ goalChecks: [] });
			expect(lastGoalCheck(s)).toBeNull();
		});

		it("returns the most recent check", () => {
			const s = makeState({
				goalChecks: [
					{
						kind: "drift",
						aligned: true,
						driftScore: 0,
						reasoning: "first",
						checkedAt: clock.t,
					},
					{
						kind: "verify",
						aligned: false,
						driftScore: 0.3,
						reasoning: "second",
						checkedAt: clock.t + 1,
					},
				],
			});
			expect(lastGoalCheck(s)?.reasoning).toBe("second");
		});
	});

	describe("driftSeverity", () => {
		it("returns ok below warn threshold", () => {
			expect(driftSeverity(0)).toBe("ok");
			expect(driftSeverity(0.49)).toBe("ok");
		});

		it("returns warn at boundary", () => {
			expect(driftSeverity(0.5)).toBe("warn");
			expect(driftSeverity(0.84)).toBe("warn");
		});

		it("returns stop at boundary", () => {
			expect(driftSeverity(0.85)).toBe("stop");
			expect(driftSeverity(1)).toBe("stop");
		});
	});

	describe("shouldRunDriftCheck", () => {
		it("returns false when no goal is set", () => {
			const s = makeState({ goal: undefined });
			expect(shouldRunDriftCheck(s, clock.t)).toBe(false);
		});

		it("returns true on first-ever check", () => {
			const s = makeState({ goal: sampleGoal, goalChecks: [] });
			expect(shouldRunDriftCheck(s, clock.t)).toBe(true);
		});

		it("returns false within cooldown window", () => {
			const s = makeState({
				goal: sampleGoal,
				goalChecks: [
					{
						kind: "drift",
						aligned: true,
						driftScore: 0,
						reasoning: "ok",
						checkedAt: clock.t - 60_000, // 1 min ago
					},
				],
			});
			expect(shouldRunDriftCheck(s, clock.t)).toBe(false);
		});

		it("returns true once cooldown elapses", () => {
			const s = makeState({
				goal: sampleGoal,
				goalChecks: [
					{
						kind: "drift",
						aligned: true,
						driftScore: 0,
						reasoning: "ok",
						checkedAt: clock.t - 6 * 60_000, // 6 min ago
					},
				],
			});
			expect(shouldRunDriftCheck(s, clock.t)).toBe(true);
		});
	});
});
