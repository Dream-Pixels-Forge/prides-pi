/**
 * pi-prides — Shared domain types
 *
 * Pure type definitions for the PRIDES (Prototype, Review, Implement,
 * Deploy, Extend, Secure) software-development-lifecycle governance engine.
 * This module has NO runtime dependencies so it can be unit-tested in isolation.
 */

export type Phase = "P" | "R" | "I" | "D" | "E" | "S";

export type Criticality = "high" | "critical" | "medium";

export type GateStatus = "pass" | "fail" | "warn" | "pending";

export type GateType = "command" | "artifact" | "manual" | "eval";

/** Verdict returned by an injected LLM judge for an `eval` gate. */
export interface JudgeVerdict {
	status: GateStatus;
	message: string;
	score?: number;
}

/** LLM-as-judge, injected by the host (pi wires this to a configured model). */
export type Judge = (
	prompt: string,
	ctx: { cwd: string },
) => Promise<JudgeVerdict>;

export interface PhaseConfig {
	phase: Phase;
	name: string;
	heartbeatMs: number;
	criticality: Criticality;
}

export interface GateDef {
	name: string;
	phase: Phase;
	description: string;
	type: GateType;
	/** Shell command to run for `command` gates. */
	command?: string;
	/** Glob (relative to cwd) to check for existence for `artifact` gates. */
	artifactGlob?: string;
	/** Optional minimum score/threshold message. */
	minScore?: number;
	/** Evaluation rubric for `eval` gates (passed to the injected LLM judge). */
	prompt?: string;
}

export interface GateResult {
	name: string;
	phase: Phase;
	status: GateStatus;
	score?: number;
	message: string;
	ranAt: number;
}

export interface PRIDESTask {
	id: number;
	description: string;
	status: "pending" | "in_progress" | "completed" | "blocked";
	phase: Phase;
	createdAt: number;
}

export interface Artifact {
	id: string;
	phase: Phase;
	kind: string;
	path?: string;
	note?: string;
	createdAt: number;
}

export type HeartbeatStatus = "HEALTHY" | "DRIFTING" | "STALLED";

export interface HeartbeatPulse {
	phase: Phase;
	status: HeartbeatStatus;
	intent: string;
	resourceUsage?: { tokens?: number; latencyMs?: number };
	at: number;
}

export interface ProjectIntent {
	name: string;
	purpose: string;
	stack?: string;
	repository?: string;
}

export type BranchType =
	| "main"
	| "feature"
	| "hotfix"
	| "bug"
	| "release"
	| "chore";

export type GitWorkflowStep =
	| "branch"
	| "code"
	| "rebase"
	| "PR"
	| "review"
	| "merge";

export interface GitWorkflowState {
	currentBranch?: string;
	branchType?: BranchType;
	targetBranch?: string;
	step?: GitWorkflowStep;
	prNumber?: number;
	prUrl?: string;
	rebasedAt?: number;
	reviewStatus?: "pending" | "approved" | "changes_requested";
}

export type AuditKind =
	| "init"
	| "phase_advance"
	| "phase_set"
	| "gate"
	| "gates"
	| "heartbeat"
	| "emergency_stop"
	| "emergency_resume"
	| "artifact"
	| "task_add"
	| "task_done"
	| "scaffold"
	| "report"
	| "git_branch"
	| "git_rebase"
	| "git_pr"
	| "git_review"
	| "git_merge";

export interface PRIDESAuditEvent {
	kind: AuditKind;
	phase: Phase;
	at: number;
	message: string;
	actor?: "tool" | "command";
}

/** Canonical, serializable engine state. Persisted to the session by the host. */
export interface PRIDESState {
	version: 1;
	phase: Phase;
	phaseEnteredAt: number;
	tasks: PRIDESTask[];
	nextTaskId: number;
	/** Last GateResult keyed by gate name. */
	gates: Record<string, GateResult>;
	heartbeat: HeartbeatPulse | null;
	emergencyStop: boolean;
	artifacts: Artifact[];
	events: PRIDESAuditEvent[];
	intent?: ProjectIntent;
	git?: GitWorkflowState;
}

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Runs a shell command and returns its exit code + output. Injected for testability. */
export type GateRunner = (
	command: string,
	cwd: string,
) => Promise<CommandResult>;

/** Resolves a glob to matching file paths (relative to cwd). Injected for testability. */
export type Globber = (pattern: string, cwd: string) => Promise<string[]>;

/** Returns the current time in epoch milliseconds. Injected for testability. */
export type Clock = () => number;
