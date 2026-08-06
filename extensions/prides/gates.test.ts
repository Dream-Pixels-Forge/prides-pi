import { describe, expect, it } from "vitest";
import {
	allPass,
	DEFAULT_GATES,
	evaluateGate,
	evaluateGatesForPhase,
	getGate,
	getGatesForPhase,
} from "./gates.js";
import type { CommandResult, GateDef } from "./types.js";

const noopGlob = async (): Promise<string[]> => [];
const mockJudge = async () => ({ status: "pass" as const, message: "ok" });

describe("gates", () => {
	it("looks up a gate by name and by phase", () => {
		expect(getGate("linter", DEFAULT_GATES)?.phase).toBe("I");
		expect(getGatesForPhase("S", DEFAULT_GATES).map((g) => g.name)).toContain(
			"security",
		);
	});

	it("manual gates are always pending", async () => {
		const def: GateDef = {
			name: "review",
			phase: "R",
			description: "x",
			type: "manual",
		};
		const r = await evaluateGate(
			def,
			async () => ({ code: 0, stdout: "", stderr: "" }),
			noopGlob,
			() => 1,
			"/x",
			mockJudge,
		);
		expect(r.status).toBe("pending");
	});

	it("command gates pass on exit 0 and fail otherwise", async () => {
		const def: GateDef = {
			name: "lint",
			phase: "I",
			description: "x",
			type: "command",
			command: "npm run lint",
		};
		const ok = await evaluateGate(
			def,
			async (): Promise<CommandResult> => ({ code: 0, stdout: "", stderr: "" }),
			noopGlob,
			() => 1,
			"/x",
			mockJudge,
		);
		expect(ok.status).toBe("pass");
		const bad = await evaluateGate(
			def,
			async (): Promise<CommandResult> => ({
				code: 1,
				stdout: "",
				stderr: "err",
			}),
			noopGlob,
			() => 1,
			"/x",
			mockJudge,
		);
		expect(bad.status).toBe("fail");
	});

	it("artifact gates check glob results", async () => {
		const def: GateDef = {
			name: "prd",
			phase: "P",
			description: "x",
			type: "artifact",
			artifactGlob: "*.md",
		};
		const none = await evaluateGate(
			def,
			async () => ({ code: 0, stdout: "", stderr: "" }),
			async () => [],
			() => 1,
			"/x",
			mockJudge,
		);
		expect(none.status).toBe("fail");
		const some = await evaluateGate(
			def,
			async () => ({ code: 0, stdout: "", stderr: "" }),
			async () => ["a.md"],
			() => 1,
			"/x",
			mockJudge,
		);
		expect(some.status).toBe("pass");
	});

	it("evaluates all gates for a phase and summarizes", async () => {
		const results = await evaluateGatesForPhase(
			"I",
			DEFAULT_GATES,
			async () => ({ code: 0, stdout: "", stderr: "" }),
			noopGlob,
			() => 1,
			"/x",
			mockJudge,
		);
		expect(results.length).toBeGreaterThan(0);
		expect(allPass(results)).toBe(true);
	});
});
