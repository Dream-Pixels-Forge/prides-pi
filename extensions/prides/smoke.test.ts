/**
 * pi-prides — Live smoke test
 *
 * Drives the engine through a realistic lifecycle to verify that the
 * new v2.0/v2.1 features wire together correctly:
 *   1. Scaffold → set intent → set goal → generate plan
 *   2. prides_drive recommends the right next tool at each step
 *   3. prides_orchestrate_handoff routes to the correct specialist skill
 *   4. prides_status surfaces the full StatusSnapshot
 *   5. Drift detection triggers the warning + blocks advance
 *   6. prides_drift_ack unblocks advance
 *   7. prides_plan re-runs after state change
 *
 * This is an integration-level test (not a unit test) — it verifies
 * that multiple modules compose correctly, which is what a live pi
 * session would experience.
 */

import { describe, expect, it } from "vitest";
import { nextAction } from "./drive.js";
import { type EngineDeps, PRIDESEngine } from "./engine.js";
import { DEFAULT_GATES } from "./gates.js";
import { buildHandoff } from "./handoff.js";
import { PHASE_ORDER } from "./phases.js";
import { generatePlan } from "./plan.js";
import { buildStatus } from "./status.js";
import type { CommandResult, GoalCheckResult, JudgeVerdict } from "./types.js";

interface TestClock {
	t: number;
}

function makeEngine(
	opts: {
		clock?: TestClock;
		judge?: (prompt: string) => Promise<JudgeVerdict>;
	} = {},
): { engine: PRIDESEngine; clock: TestClock } {
	const clock: TestClock = opts.clock ?? { t: 1000 };
	const runner = async (_cmd: string): Promise<CommandResult> => ({
		code: 0,
		stdout: "",
		stderr: "",
	});
	const globber = async (): Promise<string[]> => [];
	const judge =
		opts.judge ??
		(async () => ({ status: "pass" as const, message: "ok" }) as JudgeVerdict);
	const deps: EngineDeps = {
		runner,
		globber,
		now: () => clock.t,
		cwd: "/tmp",
		defs: DEFAULT_GATES,
		judge,
	};
	return { engine: PRIDESEngine.fresh(deps), clock };
}

describe("live smoke — full lifecycle", () => {
	it("step 1: scaffold intent + goal set the foundation", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "demo", purpose: "showcase PRIDES" });
		engine.setGoal({
			objective: "demo goal",
			successCriteria: ["tests pass", "docs written"],
		});
		expect(engine.state.intent?.name).toBe("demo");
		expect(engine.state.goal?.objective).toBe("demo goal");
	});

	it("step 2: prides_drive recommends plan after goal set", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		const action = nextAction(engine.state, DEFAULT_GATES);
		expect(action.kind).toBe("plan");
		expect(action.tool).toBe("prides_plan");
	});

	it("step 3: prides_orchestrate_handoff routes P-phase-with-goal to prides-implementation", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		const h = buildHandoff(engine.state);
		expect(h.primarySkill).toBe("prides-implementation");
		expect(h.crossReferences.length).toBeGreaterThanOrEqual(6);
		expect(h.crossReferences.map((c) => c.skill)).toContain(
			"pipeline-orchestrator",
		);
	});

	it("step 4: prides_status exposes the full StatusSnapshot shape", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		const status = buildStatus(
			engine.state,
			DEFAULT_GATES,
			{
				issuesOpened: 5,
				issuesClosed: 3,
				prsOpened: 2,
				prsClosed: 1,
				prsMerged: 1,
			},
			() => 1000,
		);
		expect(status.phase).toBe("P");
		expect(status.phaseIndex).toBe(0);
		expect(status.phaseTotal).toBe(PHASE_ORDER.length);
		expect(status.issuesOpen).toBe(2);
		expect(status.prsOpen).toBe(1);
		expect(status.widgetLines.length).toBeGreaterThan(0);
		expect(status.widgetLines.some((l) => l.includes("[P]"))).toBe(true);
	});

	it("step 5: drift detection blocks phase advance", async () => {
		const { engine, clock } = makeEngine({
			judge: async () => ({ status: "fail", message: "off topic", score: 0.7 }),
		});
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		await engine.checkGoalDrift();
		clock.t += 1000;
		const r = engine.advance();
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/drift/i);
	});

	it("step 6: prides_drift_ack unblocks advance", async () => {
		const { engine, clock } = makeEngine({
			judge: async () => ({ status: "fail", message: "off topic", score: 0.7 }),
		});
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		await engine.checkGoalDrift();
		clock.t += 1000;
		const before = engine.advance();
		expect(before.ok).toBe(false);
		engine.acknowledgeDrift(0.7);
		const after = engine.advance();
		expect(after.ok).toBe(true);
		expect(after.next).toBe("R");
	});

	it("step 7: prides_plan regenerates with new goal criteria", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		const plan1 = generatePlan(engine.state, DEFAULT_GATES);
		const draftCount1 =
			plan1.find((p) => p.phase === "I")?.draftTasks.length ?? 0;

		engine.setGoal({
			objective: "z",
			successCriteria: ["a", "b", "c", "d"],
		});
		const plan2 = generatePlan(engine.state, DEFAULT_GATES);
		const draftCount2 =
			plan2.find((p) => p.phase === "I")?.draftTasks.length ?? 0;
		expect(draftCount2).toBeGreaterThan(draftCount1);
	});

	it("step 8: end-to-end advance from P to R with all checks satisfied", () => {
		const { engine, clock } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		// P has no gates; advance should pass
		const r1 = engine.advance();
		expect(r1.ok).toBe(true);
		expect(engine.state.phase).toBe("R");
		// R has a 'review' manual gate — blocks until signed off
		const r2 = engine.advance();
		expect(r2.ok).toBe(false);
		// Sign off manually
		engine.approveGate("review");
		clock.t += 1000;
		const r3 = engine.advance();
		expect(r3.ok).toBe(true);
		expect(engine.state.phase).toBe("I");
	});

	it("step 9: I→D requires goal verification + 100% task completion", () => {
		const { engine, clock } = makeEngine();
		engine.setIntent({ name: "x", purpose: "y" });
		engine.setGoal({ objective: "z", successCriteria: ["a"] });
		// Drive P→R
		engine.advance();
		// Sign off review manually
		engine.approveGate("review");
		clock.t += 1000;
		engine.advance(); // R→I
		// Add I-phase tasks, complete them all
		const t1 = engine.addTask("first", "I");
		const t2 = engine.addTask("second", "I");
		engine.doneTask(t1.id);
		engine.doneTask(t2.id);
		// Try I→D: should be blocked on goal verification
		const blocked = engine.advance();
		expect(blocked.ok).toBe(false);
		expect(blocked.message).toMatch(/verify/i);
		// Inject a verify check result manually
		const verifyCheck: GoalCheckResult = {
			kind: "verify",
			aligned: true,
			driftScore: 0.1,
			reasoning: "all criteria met",
			checkedAt: clock.t + 1000,
		};
		engine.state = { ...engine.state, goalChecks: [verifyCheck] };
		clock.t += 2000;
		const ok = engine.advance();
		expect(ok.ok).toBe(true);
		expect(engine.state.phase).toBe("D");
	});

	it("step 10: emergency stop halts the lifecycle", () => {
		const { engine } = makeEngine();
		engine.emergencyStop("test");
		expect(engine.state.emergencyStop).toBe(true);
		// nextAction should recommend emergency_resume
		const action = nextAction(engine.state, DEFAULT_GATES);
		expect(action.kind).toBe("emergency_resume");
		expect(action.urgent).toBe(true);
	});
});
