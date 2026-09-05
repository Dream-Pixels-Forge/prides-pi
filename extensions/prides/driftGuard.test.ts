import { describe, expect, it } from "vitest";
import { type EngineDeps, PRIDESEngine } from "./engine.js";
import { DEFAULT_GATES } from "./gates.js";
import type { CommandResult, Judge } from "./types.js";

function makeEngine(opts: { code?: number } = {}): {
	engine: PRIDESEngine;
	clock: { t: number };
} {
	const clock = { t: 1000 };
	const runner = async (_cmd: string): Promise<CommandResult> => ({
		code: opts.code ?? 0,
		stdout: "",
		stderr: "",
	});
	const globber = async (): Promise<string[]> => [];
	const deps: EngineDeps = {
		runner,
		globber,
		now: () => clock.t,
		cwd: "/tmp",
		defs: DEFAULT_GATES,
		judge: async () => ({ status: "pass", message: "ok" }),
	};
	return { engine: PRIDESEngine.fresh(deps), clock };
}

describe("drift enforcement", () => {
	it("starts with no drift acknowledgment", () => {
		const { engine } = makeEngine();
		expect(engine.state.driftAck).toBeUndefined();
	});

	it("acknowledgeDrift records the ack timestamp + score", () => {
		const { engine, clock } = makeEngine();
		clock.t = 2000;
		engine.acknowledgeDrift(0.7);
		expect(engine.state.driftAck?.at).toBe(2000);
		expect(engine.state.driftAck?.score).toBe(0.7);
	});

	it("blocks phase advance when an unacknowledged drift warning exists", async () => {
		const { engine, clock } = makeEngine();
		engine.setGoal({ objective: "ship", successCriteria: ["a"] });
		// Stub the judge to return a high drift score
		const origJudge: Judge = async () => ({ status: "pass", message: "ok" });
		engine.setJudge(async () => ({
			status: "fail",
			message: "drifted",
			score: 0.6,
		}));
		// Trigger a drift check
		await engine.checkGoalDrift();
		// Move to a phase with no blocking gates for advance (P -> R)
		const r = engine.advance();
		// Advance should be blocked due to unacknowledged drift
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/drift/i);
		// Restore and re-acknowledge
		engine.setJudge(origJudge);
		clock.t = 3000;
		engine.acknowledgeDrift(0.6);
		const r2 = engine.advance();
		expect(r2.ok).toBe(true);
	});

	it("allows advance when drift has been acknowledged at >= current score", () => {
		const { engine } = makeEngine();
		engine.setGoal({ objective: "ship", successCriteria: ["a"] });
		engine.acknowledgeDrift(0.3);
		// Simulate a drift score below ack threshold by pushing a goal check
		engine.state = {
			...engine.state,
			goalChecks: [
				{
					kind: "drift",
					aligned: true,
					driftScore: 0.2,
					reasoning: "ok",
					checkedAt: 1000,
				},
			],
		};
		const r = engine.advance();
		expect(r.ok).toBe(true);
	});

	it("requires force when drift blocks and user explicitly overrides", () => {
		const { engine } = makeEngine();
		engine.setGoal({ objective: "ship", successCriteria: ["a"] });
		// Inject a real active goal-drift warning (the same shape
		// addWarning("warn", "goal-drift", ...) would produce).
		engine.state = {
			...engine.state,
			warnings: [
				{
					id: "w-drift-1",
					severity: "warn",
					category: "goal-drift",
					message: "off track",
					createdAt: 500,
				},
			],
		};
		// Without force: blocked
		const r1 = engine.advance();
		expect(r1.ok).toBe(false);
		// With force: allowed
		const r2 = engine.advance(true);
		expect(r2.ok).toBe(true);
	});

	it("addWarning is called automatically when drift score is in warn range", async () => {
		const { engine } = makeEngine();
		engine.setGoal({ objective: "ship", successCriteria: ["a"] });
		const origJudge: Judge = async () => ({ status: "pass", message: "ok" });
		// score 0.6 is in the warn range (0.5 <= s < 0.85)
		engine.setJudge(async () => ({
			status: "fail",
			message: "drifted badly",
			score: 0.6,
		}));
		await engine.checkGoalDrift();
		const driftWarnings = engine.state.warnings.filter(
			(w) => w.category === "goal-drift" && !w.resolvedAt,
		);
		expect(driftWarnings.length).toBeGreaterThan(0);
		engine.setJudge(origJudge);
	});
});
