import { describe, expect, it } from "vitest";
import { scaffoldPlan } from "./scaffold.js";
import type { ProjectIntent } from "./types.js";

describe("scaffold", () => {
	const intent: ProjectIntent = {
		name: "Acme",
		purpose: "Build things",
		stack: "TS",
		repository: "gh:x/y",
	};

	it("plans the standard PRIDES file set", () => {
		const files = scaffoldPlan(intent, () => 0);
		const paths = files.map((f) => f.path);
		expect(paths).toContain(".prides/intent.json");
		expect(paths).toContain(".prides/goal.json");
		expect(paths).toContain(".prides/gates.config.json");
		expect(paths).toContain("dev_notes/TASKS.md");
		expect(paths).toContain("PRIDES.md");
	});

	it("embeds intent into intent.json", () => {
		const files = scaffoldPlan(intent, () => 0);
		const intentFile = files.find((f) => f.path === ".prides/intent.json");
		const parsed = JSON.parse(intentFile?.content ?? "{}");
		expect(parsed.name).toBe("Acme");
		expect(parsed.methodology).toBe("PRIDES");
		expect(parsed.repository).toBe("gh:x/y");
	});

	it("creates a goal.json template", () => {
		const files = scaffoldPlan(intent, () => 0);
		const goalFile = files.find((f) => f.path === ".prides/goal.json");
		const parsed = JSON.parse(goalFile?.content ?? "{}");
		expect(parsed.objective).toBe("");
		expect(parsed.successCriteria).toEqual([]);
		expect(parsed.nonGoals).toEqual([]);
		expect(parsed.constraints).toEqual([]);
		expect(parsed.setAt).toBeNull();
	});
});
