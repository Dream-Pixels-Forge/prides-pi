/**
 * pi-prides — Git Workflow & Branch Taxonomy Engine
 *
 * Pure functions for git branch categorization (main, feature, hotfix, bug, release, chore)
 * and step lifecycle progression (branch -> code -> rebase -> PR -> review -> merge).
 * No I/O, no shell execution, no dependencies on pi.
 */

import type { BranchType, GitWorkflowState, GitWorkflowStep } from "./types.js";

export const GIT_WORKFLOW_STEPS: GitWorkflowStep[] = [
	"branch",
	"code",
	"rebase",
	"PR",
	"review",
	"merge",
];

/**
 * Classify a branch name into a standard BranchType category.
 */
export function parseBranchType(branchName: string): BranchType {
	const name = branchName.trim().toLowerCase();
	if (
		name === "main" ||
		name === "master" ||
		name === "develop" ||
		name === "dev"
	) {
		return "main";
	}
	if (name.startsWith("feature/") || name.startsWith("features/")) {
		return "feature";
	}
	if (name.startsWith("hotfix/") || name.startsWith("hotfixes/")) {
		return "hotfix";
	}
	if (
		name.startsWith("bug/") ||
		name.startsWith("bugs/") ||
		name.startsWith("bugfix/") ||
		name.startsWith("bugfixes/") ||
		name.startsWith("fix/")
	) {
		return "bug";
	}
	if (name.startsWith("release/") || name.startsWith("releases/")) {
		return "release";
	}
	if (
		name.startsWith("chore/") ||
		name.startsWith("chores/") ||
		name.startsWith("docs/")
	) {
		return "chore";
	}

	return "feature";
}

export interface BranchValidationResult {
	ok: boolean;
	type: BranchType;
	reason?: string;
}

/**
 * Allow-list for branch names: git ref-safe AND shell-safe.
 *
 * git itself forbids ` ~ ^ : ? * [ \\` and control chars, but shell
 * metacharacters (`; & | $ \` ( ) < > ! ' "` and spaces) are valid in git
 * refs — and fatal when the name is interpolated into a shell command
 * (CWE-78). Branch names are LLM/user input, so we deny-by-default:
 * `[A-Za-z0-9]` start, then `[A-Za-z0-9._/-]`, no leading `-` (no option
 * injection), no empty segments (no traversal), max 128 chars (git ref limit).
 */
const BRANCH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const MAX_BRANCH_LENGTH = 128;

/**
 * Validate a branch name for validity and taxonomy formatting.
 */
export function validateBranchName(branchName: string): BranchValidationResult {
	const name = branchName.trim();
	if (!name) {
		return {
			ok: false,
			type: "feature",
			reason: "Branch name cannot be empty",
		};
	}

	if (name.length > MAX_BRANCH_LENGTH) {
		return {
			ok: false,
			type: parseBranchType(name),
			reason: `Branch name exceeds ${MAX_BRANCH_LENGTH} characters`,
		};
	}

	// Deny-by-default allow-list (git ref rules + shell metacharacters + option injection)
	if (!BRANCH_NAME_RE.test(name)) {
		return {
			ok: false,
			type: parseBranchType(name),
			reason: `Branch name '${name}' contains characters outside [A-Za-z0-9._/-]; shell metacharacters and spaces are not allowed`,
		};
	}

	if (name.includes("..") || name.endsWith(".") || name.endsWith("/")) {
		return {
			ok: false,
			type: parseBranchType(name),
			reason: `Branch name '${name}' contains an invalid empty segment`,
		};
	}

	const type = parseBranchType(name);
	if (type !== "main" && !name.includes("/")) {
		return {
			ok: true,
			type,
			reason: `Tip: non-main branch '${name}' should ideally use a prefix like feature/, hotfix/, or bug/`,
		};
	}

	return { ok: true, type };
}

export interface StepTransitionCheck {
	ok: boolean;
	reason?: string;
}

/**
 * Checks if transitioning from current step to next step is valid.
 */
export function canTransitionGitStep(
	current?: GitWorkflowStep,
	next?: GitWorkflowStep,
): StepTransitionCheck {
	if (!next) {
		return { ok: false, reason: "Target git step is undefined" };
	}

	if (!current) {
		if (next === "branch" || next === "code") {
			return { ok: true };
		}
		return {
			ok: false,
			reason: `Cannot start workflow at step '${next}' without creating/selecting a branch first`,
		};
	}

	const currentIndex = GIT_WORKFLOW_STEPS.indexOf(current);
	const nextIndex = GIT_WORKFLOW_STEPS.indexOf(next);

	if (currentIndex < 0 || nextIndex < 0) {
		return { ok: false, reason: `Invalid step: '${current}' or '${next}'` };
	}

	// Allow forward progression or staying on same step or jumping to rebase
	if (nextIndex >= currentIndex || next === "rebase") {
		return { ok: true };
	}

	return {
		ok: false,
		reason: `Cannot regress git workflow step from '${current}' back to '${next}'`,
	};
}

/**
 * Format a human-readable text summary of git workflow state.
 */
export function formatGitWorkflowSummary(git?: GitWorkflowState): string {
	if (!git?.currentBranch) {
		return "Git Workflow: Uninitialized (no active branch tracked)";
	}

	const parts: string[] = [
		`Branch: ${git.currentBranch} [Category: ${git.branchType ?? "unknown"}]`,
		`Step: ${git.step ?? "branch"} (target: ${git.targetBranch ?? "main"})`,
	];

	if (git.rebasedAt) {
		parts.push(`Rebased at: ${new Date(git.rebasedAt).toISOString()}`);
	}

	if (git.prNumber || git.prUrl) {
		parts.push(
			`PR: #${git.prNumber ?? "N/A"} (${git.prUrl ?? "no URL"}) [Review: ${git.reviewStatus ?? "pending"}]`,
		);
	}

	return parts.join("\n");
}
