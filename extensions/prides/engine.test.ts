import { describe, expect, it } from "vitest";
import { type EngineDeps, PRIDESEngine } from "./engine.js";
import { DEFAULT_GATES } from "./gates.js";
import type { CommandResult } from "./types.js";

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

describe("PRIDESEngine", () => {
	it("starts in Prototype and advances linearly", () => {
		const { engine } = makeEngine();
		expect(engine.state.phase).toBe("P");
		const r = engine.advance();
		expect(r.ok).toBe(true);
		expect(r.next).toBe("R");
		expect(engine.state.phase).toBe("R");
	});

	it("blocks advance at the final phase", () => {
		const { engine } = makeEngine();
		engine.state.phase = "S";
		expect(engine.advance().ok).toBe(false);
	});

	it("emergency stop blocks advancement and mutations", () => {
		const { engine } = makeEngine();
		engine.emergencyStop("critical failure");
		expect(engine.state.emergencyStop).toBe(true);
		expect(engine.advance().ok).toBe(false);
		engine.emergencyResume();
		expect(engine.advance().ok).toBe(true);
	});

	it("runs a command gate and records the result", async () => {
		const { engine } = makeEngine({ code: 0 });
		const { ok, result } = await engine.runGate("linter");
		expect(ok).toBe(true);
		expect(result.status).toBe("pass");
		expect(engine.state.gates.linter.status).toBe("pass");
	});

	it("failing gate blocks advance from that phase", async () => {
		const { engine } = makeEngine({ code: 1 });
		engine.setPhase("I");
		await engine.runGate("linter");
		expect(engine.state.gates.linter.status).toBe("fail");
		expect(engine.advance().ok).toBe(false);
	});

	it("tracks tasks and completion", () => {
		const { engine } = makeEngine();
		const t = engine.addTask("write tests");
		expect(t.id).toBe(1);
		expect(engine.listTasks()).toHaveLength(1);
		const done = engine.doneTask(1);
		expect(done.ok).toBe(true);
		expect(engine.listTasks()[0].status).toBe("completed");
		expect(engine.doneTask(99).ok).toBe(false);
	});

	it("records a heartbeat pulse", () => {
		const { engine } = makeEngine();
		const pulse = engine.heartbeat("implementing auth");
		expect(pulse.status).toBe("HEALTHY");
		expect(pulse.intent).toBe("implementing auth");
		expect(engine.state.heartbeat).not.toBeNull();
	});

	it("produces a report string", () => {
		const { engine } = makeEngine();
		engine.addTask("demo");
		const report = engine.report();
		expect(report).toContain("PRIDES Session Report");
		expect(report).toContain("Recommendations");
	});

	it("plans a scaffold and stamps intent", () => {
		const { engine } = makeEngine();
		engine.setIntent({ name: "Acme", purpose: "demo" });
		const files = engine.planScaffold(
			engine.state.intent ?? { name: "Acme", purpose: "demo" },
		);
		expect(files.find((f) => f.path === ".prides/intent.json")).toBeDefined();
	});

	it("logs artifacts to the audit trail", () => {
		const { engine } = makeEngine();
		const a = engine.addArtifact({
			phase: "P",
			kind: "prd",
			path: "dev_notes/prd.md",
		});
		expect(a.kind).toBe("prd");
		expect(engine.state.artifacts).toHaveLength(1);
	});

	it("manual gate blocks advance until signed off", async () => {
		const { engine } = makeEngine();
		engine.setPhase("R");
		expect(engine.advance().ok).toBe(false);
		const approved = engine.approveGate("review");
		expect(approved.ok).toBe(true);
		expect(engine.state.gates.review.status).toBe("pass");
		expect(engine.advance().ok).toBe(true);
	});

	it("approveGate only works on manual gates", () => {
		const { engine } = makeEngine();
		engine.setPhase("I");
		const r = engine.approveGate("linter");
		expect(r.ok).toBe(false);
		expect(engine.state.gates.linter).toBeUndefined();
	});

	it("tracks git branch creation, steps, rebase, PR, review and merge", () => {
		const { engine } = makeEngine();
		const branchRes = engine.startGitBranch("feature/add-payment");
		expect(branchRes.ok).toBe(true);
		expect(engine.state.git?.currentBranch).toBe("feature/add-payment");
		expect(engine.state.git?.branchType).toBe("feature");
		expect(engine.state.git?.step).toBe("branch");

		const rebaseRes = engine.recordGitRebase();
		expect(rebaseRes.ok).toBe(true);
		expect(engine.state.git?.step).toBe("rebase");
		expect(engine.state.git?.rebasedAt).toBe(1000);

		const prRes = engine.recordGitPR(
			101,
			"https://github.com/org/repo/pull/101",
		);
		expect(prRes.ok).toBe(true);
		expect(engine.state.git?.step).toBe("PR");
		expect(engine.state.git?.prNumber).toBe(101);

		const reviewRes = engine.recordGitReview("approved");
		expect(reviewRes.ok).toBe(true);
		expect(engine.state.git?.step).toBe("review");
		expect(engine.state.git?.reviewStatus).toBe("approved");

		const mergeRes = engine.recordGitMerge();
		expect(mergeRes.ok).toBe(true);
		expect(engine.state.git?.currentBranch).toBe("main");
		expect(engine.state.git?.step).toBe("merge");

		const events = engine.state.events;
		expect(events.some((e) => e.kind === "git_branch")).toBe(true);
		expect(events.some((e) => e.kind === "git_merge")).toBe(true);
	});
});
