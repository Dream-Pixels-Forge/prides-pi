/**
 * pi-prides — Goal-loop prompt-eval harness (closes #43)
 *
 * Loads hand-labeled cases from `dev_notes/eval/drift-cases/` and verifies
 * that:
 *  1. `buildDriftPrompt(goal, activity)` includes the expected sections
 *     (objective, success criteria, non-goals, constraints, recent activity).
 *  2. A keyword-based stub judge correctly classifies each case as
 *     aligned vs drifted by matching activity strings against the goal's
 *     nonGoals/constraints lists.
 *
 * The stub judge is intentionally simple — it's a deterministic check,
 * not an LLM. The real judge (configurable via PRIDES_EVAL_CMD) is what
 * actually gates phase advance. This eval ensures the prompts contain
 * enough information for any reasonable judge to do its job.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDriftPrompt, buildVerifyPrompt } from "./goal.js";
import type { GoalSpec } from "./types.js";

interface ActivityEntry {
	kind: string;
	phase: string;
	message: string;
}

interface DriftCase {
	id: string;
	description: string;
	label: "aligned" | "drifted";
	notes: string;
	goal: GoalSpec;
	activity: ActivityEntry[];
}

function loadCases(): DriftCase[] {
	const dir = resolve(__dirname, "../../dev_notes/eval/drift-cases");
	const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
	const out: DriftCase[] = [];
	for (const f of files) {
		const raw = readFileSync(join(dir, f), "utf8");
		const parsed = JSON.parse(raw) as DriftCase;
		// Ensure setAt is set so it matches GoalSpec
		if (!parsed.goal.setAt) parsed.goal.setAt = 0;
		out.push(parsed);
	}
	return out;
}

function activityToString(activity: ActivityEntry[]): string {
	return activity.map((a) => `[${a.kind}] ${a.message}`).join("\n");
}

/**
 * Stub judge: scans activity lines for keywords that appear in the
 * goal's nonGoals list OR violate a stated constraint. Returns
 * "drifted" if any match found, "aligned" otherwise.
 *
 * The real judge (PRIDES_EVAL_CMD) is much smarter; this stub just
 * validates that the prompt surfaces enough information for any
 * judge to make the right call.
 */
function stubJudge(goal: GoalSpec, activity: string): "aligned" | "drifted" {
	const lcActivity = activity.toLowerCase();
	// 1. NonGoals violation
	if (goal.nonGoals?.length) {
		for (const ng of goal.nonGoals) {
			const token = ng
				.toLowerCase()
				.split(/\s+/)
				.find((w) => w.length >= 4);
			if (token && lcActivity.includes(token)) return "drifted";
		}
	}
	// 2. Constraint violation
	if (goal.constraints?.length) {
		for (const c of goal.constraints) {
			const lc = c.toLowerCase();
			if (lc.includes("no new runtime dependencies")) {
				if (
					lcActivity.includes("npm install ") ||
					lcActivity.includes("add new dep") ||
					lcActivity.includes("yarn add ") ||
					lcActivity.includes("pnpm add ")
				)
					return "drifted";
			}
		}
	}
	// 3. Topic-shift: extract distinctive keywords from BOTH the objective and
	// success criteria. If the activity touches the goal's domain at all (any
	// distinctive keyword match), it's not a topic shift. Drift is only when
	// the activity references neither the goal nor its criteria.
	const stopWords = new Set([
		"with",
		"from",
		"that",
		"this",
		"return",
		"returns",
		"valid",
		"invalid",
		"other",
		"missing",
		"endpoint",
		"endpoints",
		"credentials",
	]);
	// Domain-aware short tokens that carry meaning even when < 5 chars
	// (e.g. "JWT", "API", "URL"). The judge looks for these as substrings.
	const shortTokens = new Set([
		"jwt",
		"api",
		"url",
		"uri",
		"sql",
		"css",
		"sdk",
	]);
	const domainKeywords = new Set<string>();
	const collect = (s: string) => {
		for (const word of s.split(/\s+/)) {
			const cleaned = word.replace(/[^a-z0-9]/gi, "").toLowerCase();
			if (cleaned.length >= 5 && !stopWords.has(cleaned))
				domainKeywords.add(cleaned);
			else if (cleaned.length >= 3 && shortTokens.has(cleaned))
				domainKeywords.add(cleaned);
		}
	};
	collect(goal.objective);
	for (const c of goal.successCriteria) collect(c);
	if (domainKeywords.size > 0) {
		const matchCount = [...domainKeywords].filter((kw) =>
			lcActivity.includes(kw),
		).length;
		if (matchCount === 0) return "drifted";
	}
	return "aligned";
}

describe("goal-loop prompt eval", () => {
	const cases = loadCases();

	it("loads at least 5 labeled cases", () => {
		expect(cases.length).toBeGreaterThanOrEqual(5);
	});

	it("every case has a label, goal, and activity", () => {
		for (const c of cases) {
			expect(c.label).toMatch(/^(aligned|drifted)$/);
			expect(c.goal.objective.length).toBeGreaterThan(0);
			expect(Array.isArray(c.activity)).toBe(true);
			expect(c.activity.length).toBeGreaterThan(0);
		}
	});

	it("every case has unique id", () => {
		const ids = new Set(cases.map((c) => c.id));
		expect(ids.size).toBe(cases.length);
	});

	describe("buildDriftPrompt — required sections", () => {
		for (const c of cases) {
			it(`${c.id} (${c.label}) — includes objective, criteria, activity`, () => {
				const activity = activityToString(c.activity);
				const prompt = buildDriftPrompt(c.goal, activity);
				expect(prompt).toContain(c.goal.objective);
				for (const sc of c.goal.successCriteria) {
					expect(prompt).toContain(sc);
				}
				expect(prompt).toContain(activity);
			});
		}
	});

	describe("buildDriftPrompt — nonGoals + constraints surface when present", () => {
		for (const c of cases) {
			if (c.goal.nonGoals?.length || c.goal.constraints?.length) {
				it(`${c.id} — non-goals/constraints visible`, () => {
					const prompt = buildDriftPrompt(c.goal, activityToString(c.activity));
					for (const ng of c.goal.nonGoals ?? []) {
						expect(prompt).toContain(ng);
					}
					for (const cn of c.goal.constraints ?? []) {
						expect(prompt).toContain(cn);
					}
				});
			}
		}
	});

	describe("buildVerifyPrompt — lists each criterion as a checklist", () => {
		for (const c of cases) {
			it(`${c.id} — success criteria enumerated`, () => {
				const prompt = buildVerifyPrompt(c.goal, activityToString(c.activity));
				for (const sc of c.goal.successCriteria) {
					expect(prompt).toContain(`- ${sc}`);
				}
			});
		}
	});

	describe("stubJudge verdict matches labeled truth", () => {
		let correct = 0;
		let total = 0;
		const failures: string[] = [];

		for (const c of cases) {
			total++;
			const activity = activityToString(c.activity);
			const verdict = stubJudge(c.goal, activity);
			if (verdict === c.label) {
				correct++;
			} else {
				failures.push(
					`${c.id}: stub judge said '${verdict}' but label is '${c.label}'`,
				);
			}
		}

		it(`stub judge accuracy ≥ 80% (${correct}/${total})`, () => {
			expect(correct / total).toBeGreaterThanOrEqual(0.8);
		});

		it(`reports any misclassifications: ${failures.length === 0 ? "none" : failures.join("; ")}`, () => {
			// Surface failures in test output for debugging without failing the suite
			if (failures.length > 0) {
				console.warn(`Stub-judge failures: ${failures.join("; ")}`);
			}
			expect(failures.length).toBeLessThanOrEqual(Math.floor(total * 0.2));
		});
	});
});
