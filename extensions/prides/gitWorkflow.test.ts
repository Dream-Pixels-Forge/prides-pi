import { describe, expect, it } from "vitest";
import {
	canTransitionGitStep,
	formatGitWorkflowSummary,
	parseBranchType,
	validateBranchName,
} from "./gitWorkflow.js";

describe("gitWorkflow — pure domain logic", () => {
	it("correctly classifies branch names into taxonomy categories", () => {
		expect(parseBranchType("main")).toBe("main");
		expect(parseBranchType("master")).toBe("main");
		expect(parseBranchType("develop")).toBe("main");

		expect(parseBranchType("feature/add-login")).toBe("feature");
		expect(parseBranchType("features/header-nav")).toBe("feature");

		expect(parseBranchType("hotfix/auth-leak")).toBe("hotfix");
		expect(parseBranchType("hotfixes/patch-1")).toBe("hotfix");

		expect(parseBranchType("bug/null-pointer")).toBe("bug");
		expect(parseBranchType("bugfix/crash-on-load")).toBe("bug");
		expect(parseBranchType("bugs/issue-42")).toBe("bug");
		expect(parseBranchType("fix/typo")).toBe("bug");

		expect(parseBranchType("release/v1.2.0")).toBe("release");
		expect(parseBranchType("chore/update-deps")).toBe("chore");
		expect(parseBranchType("docs/readme-fix")).toBe("chore");

		// fallback for non-main without prefix
		expect(parseBranchType("random-branch")).toBe("feature");
	});

	it("validates branch names for invalid characters and taxonomy tips", () => {
		expect(validateBranchName("").ok).toBe(false);
		expect(validateBranchName("feature/good-branch").ok).toBe(true);
		expect(validateBranchName("invalid branch name").ok).toBe(false);

		const tipResult = validateBranchName("some-branch");
		expect(tipResult.ok).toBe(true);
		expect(tipResult.type).toBe("feature");
		expect(tipResult.reason).toContain("Tip:");
	});

	it("enforces git step transition ordering", () => {
		expect(canTransitionGitStep(undefined, "branch").ok).toBe(true);
		expect(canTransitionGitStep(undefined, "PR").ok).toBe(false);

		expect(canTransitionGitStep("branch", "code").ok).toBe(true);
		expect(canTransitionGitStep("code", "rebase").ok).toBe(true);
		expect(canTransitionGitStep("rebase", "PR").ok).toBe(true);
		expect(canTransitionGitStep("PR", "review").ok).toBe(true);
		expect(canTransitionGitStep("review", "merge").ok).toBe(true);

		// Jump back to rebase is allowed
		expect(canTransitionGitStep("review", "rebase").ok).toBe(true);

		// Invalid backward jump
		expect(canTransitionGitStep("merge", "code").ok).toBe(false);
	});

	it("formats summary text cleanly", () => {
		expect(formatGitWorkflowSummary()).toContain("Uninitialized");

		const summary = formatGitWorkflowSummary({
			currentBranch: "feature/auth",
			branchType: "feature",
			targetBranch: "main",
			step: "PR",
			prNumber: 42,
			prUrl: "https://github.com/org/repo/pull/42",
			reviewStatus: "approved",
		});

		expect(summary).toContain("feature/auth");
		expect(summary).toContain("Category: feature");
		expect(summary).toContain("Step: PR");
		expect(summary).toContain("#42");
		expect(summary).toContain("Review: approved");
	});
});
