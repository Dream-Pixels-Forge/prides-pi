import { describe, expect, it } from "vitest";
import { mergeGhCounts, parseGhIssueList, parseGhPrList } from "./ghCounts.js";

describe("parseGhIssueList", () => {
	it("returns zeros for empty input", () => {
		expect(parseGhIssueList("[]")).toEqual({ opened: 0, closed: 0 });
	});

	it("counts open and closed issues from gh JSON", () => {
		const json = JSON.stringify([
			{ number: 1, state: "OPEN" },
			{ number: 2, state: "CLOSED" },
			{ number: 3, state: "open" },
			{ number: 4, state: "closed" },
		]);
		expect(parseGhIssueList(json)).toEqual({ opened: 2, closed: 2 });
	});

	it("returns zeros and does not throw on malformed input", () => {
		expect(parseGhIssueList("not json")).toEqual({ opened: 0, closed: 0 });
		expect(parseGhIssueList("{}")).toEqual({ opened: 0, closed: 0 });
		expect(parseGhIssueList("null")).toEqual({ opened: 0, closed: 0 });
	});
});

describe("parseGhPrList", () => {
	it("returns zeros for empty input", () => {
		expect(parseGhPrList("[]")).toEqual({ opened: 0, closed: 0, merged: 0 });
	});

	it("counts open, closed, and merged PRs", () => {
		const json = JSON.stringify([
			{ number: 1, state: "OPEN", mergedAt: null },
			{ number: 2, state: "CLOSED", mergedAt: null },
			{ number: 3, state: "MERGED", mergedAt: "2026-01-01T00:00:00Z" },
			{
				number: 4,
				state: "CLOSED",
				mergedAt: "2026-02-01T00:00:00Z",
			},
		]);
		expect(parseGhPrList(json)).toEqual({
			opened: 1,
			closed: 3,
			merged: 2,
		});
	});

	it("returns zeros on malformed input", () => {
		expect(parseGhPrList("garbage")).toEqual({
			opened: 0,
			closed: 0,
			merged: 0,
		});
	});

	it("treats null mergedAt as not merged even when state is CLOSED", () => {
		const json = JSON.stringify([
			{ number: 1, state: "CLOSED", mergedAt: null },
		]);
		expect(parseGhPrList(json)).toEqual({ opened: 0, closed: 1, merged: 0 });
	});
});

describe("mergeGhCounts", () => {
	it("merges issue counts and PR counts into IssueCounts", () => {
		const out = mergeGhCounts(
			{ opened: 5, closed: 3 },
			{ opened: 2, closed: 1, merged: 1 },
		);
		expect(out).toEqual({
			issuesOpened: 5,
			issuesClosed: 3,
			prsOpened: 2,
			prsClosed: 1,
			prsMerged: 1,
		});
	});
});
