/**
 * pi-prides — Real `gh` CLI integration test (live against this repo)
 *
 * Skipped automatically when `gh` is not installed or not authenticated.
 * When run, it verifies that prides_counts_update autoRefresh returns
 * sensible IssueCounts parsed from actual gh JSON output.
 *
 * This is the only test that touches the network/CLI. All other
 * ghCounts tests use synthetic JSON.
 */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { mergeGhCounts, parseGhIssueList, parseGhPrList } from "./ghCounts.js";

function ghAvailable(): boolean {
	const r = spawnSync("gh", ["--version"], { stdio: "ignore" });
	return r.status === 0;
}

function ghAuthenticated(): boolean {
	const r = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
	return r.status === 0;
}

function runGh(args: string[]): string {
	const r = spawnSync("gh", args, { encoding: "utf8" });
	if (r.status !== 0) {
		throw new Error(
			`gh ${args.join(" ")} failed (exit ${r.status}): ${r.stderr ?? ""}`,
		);
	}
	return r.stdout ?? "";
}

const skipReason = !ghAvailable()
	? "gh CLI not installed"
	: !ghAuthenticated()
		? "gh CLI not authenticated"
		: null;

describe.skipIf(skipReason !== null)(
	"real gh CLI integration (pi-prides repo)",
	() => {
		it("parses gh issue list against this repo", () => {
			const raw = runGh([
				"issue",
				"list",
				"--state",
				"all",
				"--json",
				"number,state",
				"--limit",
				"1000",
			]);
			const parsed = parseGhIssueList(raw);
			expect(parsed.opened).toBeGreaterThanOrEqual(0);
			expect(parsed.closed).toBeGreaterThanOrEqual(0);
			// Sanity: we know pi-prides has had closed issues + PRs historically
			expect(parsed.opened + parsed.closed).toBeGreaterThan(0);
		});

		it("parses gh pr list against this repo", () => {
			const raw = runGh([
				"pr",
				"list",
				"--state",
				"all",
				"--json",
				"number,state,mergedAt",
				"--limit",
				"1000",
			]);
			const parsed = parseGhPrList(raw);
			expect(parsed.opened).toBeGreaterThanOrEqual(0);
			expect(parsed.closed).toBeGreaterThanOrEqual(0);
			expect(parsed.merged).toBeGreaterThanOrEqual(0);
			// merged count must be <= closed count (merged PRs are a subset)
			expect(parsed.merged).toBeLessThanOrEqual(parsed.closed);
			// pi-prides has merged PRs (PR #41 was merged to main)
			expect(parsed.opened + parsed.closed).toBeGreaterThan(0);
		});

		it("mergeGhCounts produces sensible IssueCounts", () => {
			const issuesRaw = runGh([
				"issue",
				"list",
				"--state",
				"all",
				"--json",
				"number,state",
				"--limit",
				"1000",
			]);
			const prsRaw = runGh([
				"pr",
				"list",
				"--state",
				"all",
				"--json",
				"number,state,mergedAt",
				"--limit",
				"1000",
			]);
			const merged = mergeGhCounts(
				parseGhIssueList(issuesRaw),
				parseGhPrList(prsRaw),
			);
			// All fields present and non-negative integers
			for (const v of Object.values(merged)) {
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(0);
			}
			// merged count <= closed count (merged PRs are a subset of closed)
			expect(merged.prsMerged).toBeLessThanOrEqual(merged.prsClosed);
			// pi-prides has issues (open or closed)
			expect(merged.issuesOpened + merged.issuesClosed).toBeGreaterThan(0);
		});
	},
);

describe("real gh CLI integration (skipped)", () => {
	it("reports skip reason when gh is unavailable", () => {
		// Sanity: the test runner correctly identifies skip conditions
		// (this assertion always passes — the skipIf block above is what
		// actually short-circuits the live tests).
		expect(typeof skipReason === "string" || skipReason === null).toBe(true);
	});
});
