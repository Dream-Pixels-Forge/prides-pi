/**
 * pi-prides — GitHub CLI JSON parsers
 *
 * Pure functions that parse `gh issue list --json number,state` and
 * `gh pr list --json number,state,mergedAt` output into the shape
 * `IssueCounts` consumed by the widget and status snapshot.
 *
 * Robust against malformed input — all parse failures degrade to zeros
 * (the caller decides whether to surface that as a warning).
 */

import type { IssueCounts } from "./status.js";

export interface ParsedIssues {
	opened: number;
	closed: number;
}

export interface ParsedPrs {
	opened: number;
	closed: number;
	merged: number;
}

interface GhIssue {
	number?: number;
	state?: string;
}

interface GhPr {
	number?: number;
	state?: string;
	mergedAt?: string | null;
}

function safeParse<T>(raw: string): T | null {
	try {
		const v = JSON.parse(raw) as unknown;
		return v === null || v === undefined ? null : (v as T);
	} catch {
		return null;
	}
}

function norm(s: string | undefined | null): string {
	return (s ?? "").toUpperCase();
}

export function parseGhIssueList(raw: string): ParsedIssues {
	const arr = safeParse<GhIssue[]>(raw);
	if (!arr || !Array.isArray(arr)) return { opened: 0, closed: 0 };
	let opened = 0;
	let closed = 0;
	for (const it of arr) {
		const s = norm(it.state);
		if (s === "OPEN") opened++;
		else if (s === "CLOSED") closed++;
	}
	return { opened, closed };
}

export function parseGhPrList(raw: string): ParsedPrs {
	const arr = safeParse<GhPr[]>(raw);
	if (!arr || !Array.isArray(arr)) return { opened: 0, closed: 0, merged: 0 };
	let opened = 0;
	let closed = 0;
	let merged = 0;
	for (const pr of arr) {
		const s = norm(pr.state);
		const mergedAt = pr.mergedAt ?? null;
		const wasMerged =
			mergedAt !== null && mergedAt !== undefined && mergedAt !== "";
		if (wasMerged) merged++;
		if (s === "OPEN") opened++;
		else if (s === "CLOSED" || s === "MERGED") closed++;
	}
	return { opened, closed, merged };
}

export function mergeGhCounts(
	issues: ParsedIssues,
	prs: ParsedPrs,
): IssueCounts {
	return {
		issuesOpened: clamp(issues.opened),
		issuesClosed: clamp(issues.closed),
		prsOpened: clamp(prs.opened),
		prsClosed: clamp(prs.closed),
		prsMerged: clamp(prs.merged),
	};
}

function clamp(n: number): number {
	return typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
}
