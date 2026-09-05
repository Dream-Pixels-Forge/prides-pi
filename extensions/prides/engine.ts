/**
 * pi-prides — Engine (orchestration core)
 *
 * Holds the canonical PRIDES state and exposes all operations. It is PURE:
 * no filesystem, no host API, no global time. Side effects (persisting state,
 * writing scaffold files) are the host's responsibility, so this class is
 * fully unit-testable with injected clocks, runners, and globbers.
 */

import {
	evaluateGate,
	evaluateGatesForPhase,
	getGate,
	getGatesForPhase,
	summarizeGates,
} from "./gates.js";
import {
	canTransitionGitStep,
	checkBranchConforms,
	formatGitWorkflowSummary,
	validateBranchName,
} from "./gitWorkflow.js";
import {
	buildDriftPrompt,
	buildVerifyPrompt,
	driftSeverity,
	lastGoalCheck,
	parseGoalVerdict,
	recordGoalCheck,
	summarizeRecentActivity,
} from "./goal.js";
import {
	classifyPulse,
	intervalFor,
	isStalled,
	makePulse,
} from "./heartbeat.js";
import {
	canAdvance,
	getPhaseConfig,
	nextPhase,
	validateSetPhase,
} from "./phases.js";
import { type ScaffoldFile, scaffoldPlan } from "./scaffold.js";
import { createInitialState, recordEvent } from "./state.js";
import type {
	Artifact,
	BranchType,
	Clock,
	Criticality,
	GateDef,
	GateResult,
	GateRunner,
	GateType,
	GitWorkflowState,
	GitWorkflowStep,
	Globber,
	GoalCheckResult,
	GoalSpec,
	HeartbeatPulse,
	HeartbeatStatus,
	Judge,
	Phase,
	PRIDESAuditEvent,
	PRIDESState,
	PRIDESTask,
	PRIDESWarning,
	ProjectIntent,
	WarningSeverity,
} from "./types.js";

export interface EngineDeps {
	runner: GateRunner;
	globber: Globber;
	now: Clock;
	cwd: string;
	defs?: GateDef[];
	judge: Judge;
}

export interface OpResult {
	ok: boolean;
	message: string;
}

export class PRIDESEngine {
	state: PRIDESState;
	defs: GateDef[];
	private deps: EngineDeps;

	constructor(initial: PRIDESState, deps: EngineDeps) {
		this.state = initial;
		this.defs = deps.defs ?? [];
		this.deps = deps;
	}

	static fresh(deps: EngineDeps, intent?: ProjectIntent): PRIDESEngine {
		return new PRIDESEngine(createInitialState(deps.now, intent), deps);
	}

	load(state: PRIDESState): void {
		this.state = state;
	}

	serialize(): PRIDESState {
		return this.state;
	}

	private commit(
		event: Omit<PRIDESAuditEvent, "at">,
		actor: "tool" | "command" = "tool",
	): void {
		this.state = recordEvent(this.state, { ...event, actor }, this.deps.now);
	}

	// ---- Intent -------------------------------------------------------------

	setIntent(intent: ProjectIntent): OpResult {
		this.state = { ...this.state, intent };
		this.commit({
			kind: "init",
			phase: this.state.phase,
			message: `Intent set: ${intent.name}`,
		});
		return { ok: true, message: `Intent set: ${intent.name}` };
	}

	// ---- Phase progression --------------------------------------------------

	advance(force = false): { ok: boolean; message: string; next: Phase | null } {
		if (this.state.emergencyStop) {
			return {
				ok: false,
				message: "EMERGENCY STOP active — run emergency_resume first",
				next: null,
			};
		}
		const check = canAdvance(this.state, this.defs);
		if (!check.ok && !force) {
			return {
				ok: false,
				message: check.reason ?? "Cannot advance",
				next: check.next,
			};
		}
		const next = check.next;
		if (!next)
			return {
				ok: false,
				message: check.reason ?? "Cannot advance",
				next: null,
			};
		const prev = this.state.phase;
		this.state = {
			...this.state,
			phase: next,
			phaseEnteredAt: this.deps.now(),
		};
		this.commit({
			kind: "phase_advance",
			phase: next,
			message: `Advanced ${prev} → ${next}${force ? " (forced)" : ""}`,
		});
		return { ok: true, message: `Advanced ${prev} → ${next}`, next };
	}

	setPhase(target: Phase, force = false): OpResult {
		if (this.state.emergencyStop) {
			return {
				ok: false,
				message: "EMERGENCY STOP active — run emergency_resume first",
			};
		}
		const check = validateSetPhase(target, this.state, this.defs, force);
		if (!check.ok) {
			return {
				ok: false,
				message: check.reason ?? `Cannot set phase to ${target}`,
			};
		}
		const prev = this.state.phase;
		this.state = {
			...this.state,
			phase: target,
			phaseEnteredAt: this.deps.now(),
		};
		this.commit({
			kind: "phase_set",
			phase: target,
			message: `Phase set ${prev} → ${target}${force ? " (forced)" : ""}`,
		});
		return { ok: true, message: `Phase set ${prev} → ${target}` };
	}

	// ---- Quality gates ------------------------------------------------------

	/** Record human sign-off for a manual gate, setting it to pass.
	 *  Only `manual` gates can be signed off; command/artifact gates must be run. */
	approveGate(name: string): {
		ok: boolean;
		message: string;
		result?: GateResult;
	} {
		if (this.state.emergencyStop) {
			return {
				ok: false,
				message: "EMERGENCY STOP active — resolve it before signing off gates",
			};
		}
		const def = getGate(name, this.defs);
		if (!def) {
			return { ok: false, message: `Unknown gate: ${name}` };
		}
		if (def.type !== "manual") {
			return {
				ok: false,
				message: `Gate ${name} is not a manual gate; run it with prides_gate`,
			};
		}
		const result: GateResult = {
			name,
			phase: def.phase,
			status: "pass",
			message: "Manual sign-off recorded",
			ranAt: this.deps.now(),
		};
		this.state = {
			...this.state,
			gates: { ...this.state.gates, [name]: result },
		};
		this.commit({
			kind: "gate",
			phase: this.state.phase,
			message: `Manual sign-off: ${name}`,
		});
		return { ok: true, message: `Gate ${name} signed off (pass)`, result };
	}

	async runGate(name: string): Promise<{ ok: boolean; result: GateResult }> {
		const def = getGate(name, this.defs);
		if (!def) {
			const result: GateResult = {
				name,
				phase: this.state.phase,
				status: "fail",
				message: `Unknown gate: ${name}`,
				ranAt: this.deps.now(),
			};
			return { ok: false, result };
		}
		const result = await evaluateGate(
			def,
			this.deps.runner,
			this.deps.globber,
			this.deps.now,
			this.deps.cwd,
			this.deps.judge,
		);
		this.state = {
			...this.state,
			gates: { ...this.state.gates, [name]: result },
		};
		this.commit({
			kind: "gate",
			phase: this.state.phase,
			message: `Gate ${name}: ${result.status}`,
		});
		return { ok: true, result };
	}

	async runGates(): Promise<GateResult[]> {
		const results = await evaluateGatesForPhase(
			this.state.phase,
			this.defs,
			this.deps.runner,
			this.deps.globber,
			this.deps.now,
			this.deps.cwd,
			this.deps.judge,
		);
		const gates = { ...this.state.gates };
		for (const r of results) gates[r.name] = r;
		this.state = { ...this.state, gates };
		this.commit({
			kind: "gates",
			phase: this.state.phase,
			message: `Ran ${results.length} gate(s) for ${this.state.phase}: ${summarizeGates(results)}`,
		});
		return results;
	}

	// ---- Heartbeat ----------------------------------------------------------

	heartbeat(intent: string): HeartbeatPulse {
		let status: HeartbeatPulse["status"] = "HEALTHY";
		if (this.state.heartbeat) {
			const gap = this.deps.now() - this.state.heartbeat.at;
			status = classifyPulse(gap, this.state.phase);
		}
		const pulse = makePulse(this.state.phase, intent, status, this.deps.now);
		this.state = { ...this.state, heartbeat: pulse };
		this.commit({
			kind: "heartbeat",
			phase: this.state.phase,
			message: `Heartbeat ${status}`,
		});
		return pulse;
	}

	// ---- Goal loop ----------------------------------------------------------

	setGoal(goal: Omit<GoalSpec, "setAt">): OpResult {
		const full: GoalSpec = { ...goal, setAt: this.deps.now() };
		this.state = { ...this.state, goal: full };
		this.commit({
			kind: "goal_set",
			phase: this.state.phase,
			message: `Goal set: ${goal.objective}`,
		});
		return { ok: true, message: `Goal set: ${goal.objective}` };
	}

	async checkGoalDrift(): Promise<GoalCheckResult | OpResult> {
		if (!this.state.goal)
			return { ok: false, message: "No goal set — call prides_goal_set first" };
		const activity = summarizeRecentActivity(this.state, this.deps.now());
		const prompt = buildDriftPrompt(this.state.goal, activity);
		const verdict = await this.deps.judge(prompt, { cwd: this.deps.cwd });
		const result = parseGoalVerdict("drift", verdict, this.deps.now);
		this.state = recordGoalCheck(this.state, result);
		this.commit({
			kind: "goal_check",
			phase: this.state.phase,
			message: `Drift check: aligned=${result.aligned} score=${result.driftScore}`,
		});

		const severity = driftSeverity(result.driftScore);
		if (severity === "warn") {
			this.addWarning(
				"warn",
				"goal-drift",
				result.suggestedCorrection ?? result.reasoning,
			);
		} else if (severity === "stop") {
			this.state = { ...this.state, emergencyStop: true };
			this.commit({
				kind: "emergency_stop",
				phase: this.state.phase,
				message: `Auto-stop: severe goal drift (${result.driftScore}) — ${result.reasoning}`,
			});
		}

		return result;
	}

	async verifyGoal(): Promise<GoalCheckResult | OpResult> {
		if (!this.state.goal)
			return { ok: false, message: "No goal set — call prides_goal_set first" };
		const activity = summarizeRecentActivity(
			this.state,
			this.deps.now(),
			24 * 60 * 60 * 1000,
		);
		const prompt = buildVerifyPrompt(this.state.goal, activity);
		const verdict = await this.deps.judge(prompt, { cwd: this.deps.cwd });
		const result = parseGoalVerdict("verify", verdict, this.deps.now);
		this.state = recordGoalCheck(this.state, result);
		this.commit({
			kind: "goal_verify",
			phase: this.state.phase,
			message: `Goal verify: aligned=${result.aligned}`,
		});
		return result;
	}

	// ---- Emergency stop -----------------------------------------------------

	emergencyStop(reason: string): void {
		this.state = { ...this.state, emergencyStop: true };
		this.commit({
			kind: "emergency_stop",
			phase: this.state.phase,
			message: `EMERGENCY STOP: ${reason}`,
		});
	}

	emergencyResume(): void {
		this.state = { ...this.state, emergencyStop: false };
		this.commit({
			kind: "emergency_resume",
			phase: this.state.phase,
			message: "Emergency stop cleared",
		});
	}

	// ---- Tasks --------------------------------------------------------------

	addTask(
		description: string,
		phase: Phase = this.state.phase,
	): import("./types.js").PRIDESTask {
		const task: import("./types.js").PRIDESTask = {
			id: this.state.nextTaskId,
			description,
			status: "pending",
			phase,
			createdAt: this.deps.now(),
		};
		this.state = {
			...this.state,
			tasks: [...this.state.tasks, task],
			nextTaskId: this.state.nextTaskId + 1,
		};
		this.commit({ kind: "task_add", phase, message: `Task #${task.id} added` });
		return task;
	}

	doneTask(id: number): OpResult {
		const task = this.state.tasks.find((t) => t.id === id);
		if (!task) return { ok: false, message: `Task #${id} not found` };
		this.state = {
			...this.state,
			tasks: this.state.tasks.map((t) =>
				t.id === id ? { ...t, status: "completed" } : t,
			),
		};
		this.commit({
			kind: "task_done",
			phase: this.state.phase,
			message: `Task #${id} completed`,
		});
		return { ok: true, message: `Task #${id} completed` };
	}

	listTasks(): import("./types.js").PRIDESTask[] {
		return this.state.tasks;
	}

	// ---- Artifacts ----------------------------------------------------------

	addArtifact(artifact: Omit<Artifact, "createdAt" | "id">): Artifact {
		const id = `${artifact.kind}-${this.deps.now()}`;
		const art: Artifact = { ...artifact, id, createdAt: this.deps.now() };
		this.state = { ...this.state, artifacts: [...this.state.artifacts, art] };
		this.commit({
			kind: "artifact",
			phase: this.state.phase,
			message: `Artifact logged: ${art.kind}`,
		});
		return art;
	}

	// ---- Warnings -----------------------------------------------------------

	/** Add a warning to the active warnings list. */
	addWarning(
		severity: WarningSeverity,
		category: string,
		message: string,
	): PRIDESWarning {
		const warning: PRIDESWarning = {
			id: `w-${this.deps.now()}-${Math.random().toString(36).slice(2, 6)}`,
			severity,
			category,
			message,
			createdAt: this.deps.now(),
		};
		this.state = {
			...this.state,
			warnings: [...this.state.warnings, warning],
		};
		this.commit({
			kind: "artifact",
			phase: this.state.phase,
			message: `Warning [${severity}]: ${category} — ${message}`,
		});
		return warning;
	}

	/** Resolve (dismiss) a warning by id. */
	resolveWarning(id: string): OpResult {
		const idx = this.state.warnings.findIndex((w) => w.id === id);
		if (idx < 0) return { ok: false, message: `Warning ${id} not found` };
		const warning = this.state.warnings[idx];
		if (warning.resolvedAt)
			return { ok: false, message: `Warning ${id} already resolved` };
		this.state = {
			...this.state,
			warnings: this.state.warnings.map((w) =>
				w.id === id ? { ...w, resolvedAt: this.deps.now() } : w,
			),
		};
		this.commit({
			kind: "artifact",
			phase: this.state.phase,
			message: `Warning resolved: ${id}`,
		});
		return { ok: true, message: `Warning ${id} resolved` };
	}

	/** Get all active (unresolved) warnings. */
	getActiveWarnings(): PRIDESWarning[] {
		return this.state.warnings.filter((w) => !w.resolvedAt);
	}

	/** Get active warnings filtered by severity. */
	getWarningsBySeverity(severity: WarningSeverity): PRIDESWarning[] {
		return this.state.warnings.filter(
			(w) => !w.resolvedAt && w.severity === severity,
		);
	}

	/** Check if there are any blocking warnings (warn or error severity). */
	hasBlockingWarnings(): boolean {
		return this.state.warnings.some(
			(w) => !w.resolvedAt && (w.severity === "warn" || w.severity === "error"),
		);
	}

	/** Check if git operations (commit/push) should be blocked. */
	shouldBlockGitOps(): { blocked: boolean; reason?: string } {
		// Emergency stop blocks everything
		if (this.state.emergencyStop) {
			return { blocked: true, reason: "Emergency stop active" };
		}

		// Failing gates block git ops
		const failingGates = Object.values(this.state.gates).filter(
			(g) => g.status === "fail",
		);
		if (failingGates.length > 0) {
			return {
				blocked: true,
				reason: `Failing gate(s): ${failingGates.map((g) => g.name).join(", ")}`,
			};
		}

		// Blocking warnings (warn/error) block git ops
		const blocking = this.getActiveWarnings().filter(
			(w) => w.severity === "warn" || w.severity === "error",
		);
		if (blocking.length > 0) {
			return {
				blocked: true,
				reason: `Active warnings: ${blocking.map((w) => `${w.category} (${w.severity})`).join(", ")}`,
			};
		}

		// Manual gates pending block git ops in Review+ phases
		const manualPending = this.defs.filter(
			(d) =>
				d.type === "manual" &&
				this.state.phase !== "P" &&
				(!this.state.gates[d.name] ||
					this.state.gates[d.name].status === "pending"),
		);
		if (manualPending.length > 0) {
			return {
				blocked: true,
				reason: `Manual gate(s) pending: ${manualPending.map((d) => d.name).join(", ")}`,
			};
		}

		// Non-conformant branch blocks push
		if (this.state.git?.currentBranch) {
			const conforms = checkBranchConforms(this.state.git.currentBranch);
			if (!conforms.ok) {
				return {
					blocked: true,
					reason: `Branch '${this.state.git.currentBranch}' does not follow PRIDES taxonomy: ${conforms.reason}`,
				};
			}
		}

		return { blocked: false };
	}

	// ---- Scaffold -----------------------------------------------------------

	planScaffold(intent: ProjectIntent): ScaffoldFile[] {
		return scaffoldPlan(intent, this.deps.now);
	}

	// ---- Git Workflow --------------------------------------------------------

	startGitBranch(
		branchName: string,
		category?: BranchType,
		targetBranch = "main",
	): OpResult {
		const val = validateBranchName(branchName);
		if (!val.ok) {
			return { ok: false, message: val.reason ?? "Invalid branch name" };
		}

		const branchType = category ?? val.type;
		// targetBranch also flows into shell commands (git rebase/merge), so it
		// must pass the same deny-by-default allow-list as the branch name itself.
		const target = targetBranch.trim() || "main";
		const targetVal = validateBranchName(target);
		if (!targetVal.ok) {
			return {
				ok: false,
				message: `Invalid target branch: ${targetVal.reason ?? "failed validation"}`,
			};
		}
		const gitState: GitWorkflowState = {
			currentBranch: branchName.trim(),
			branchType,
			targetBranch: target,
			step: "branch",
			reviewStatus: "pending",
		};

		this.state = { ...this.state, git: gitState };
		this.commit({
			kind: "git_branch",
			phase: this.state.phase,
			message: `Switched to branch '${gitState.currentBranch}' [${gitState.branchType}] (target: ${gitState.targetBranch})`,
		});

		const note = val.reason ? ` (${val.reason})` : "";
		return {
			ok: true,
			message: `Tracked branch '${gitState.currentBranch}' [${gitState.branchType}] step: branch${note}`,
		};
	}

	setGitStep(step: GitWorkflowStep): OpResult {
		const git = this.state.git;
		if (!git?.currentBranch) {
			return { ok: false, message: "No active git branch being tracked" };
		}

		const check = canTransitionGitStep(git.step, step);
		if (!check.ok) {
			return { ok: false, message: check.reason ?? "Invalid step transition" };
		}

		this.state = { ...this.state, git: { ...git, step } };
		this.commit({
			kind: "git_branch",
			phase: this.state.phase,
			message: `Git workflow step updated to '${step}' for branch '${git.currentBranch}'`,
		});

		return { ok: true, message: `Git workflow step updated to '${step}'` };
	}

	recordGitRebase(): OpResult {
		const git = this.state.git;
		if (!git?.currentBranch) {
			return { ok: false, message: "No active git branch being tracked" };
		}

		const nowMs = this.deps.now();
		this.state = {
			...this.state,
			git: { ...git, step: "rebase", rebasedAt: nowMs },
		};

		this.commit({
			kind: "git_rebase",
			phase: this.state.phase,
			message: `Rebased '${git.currentBranch}' onto '${git.targetBranch ?? "main"}'`,
		});

		return {
			ok: true,
			message: `Branch '${git.currentBranch}' rebased onto '${git.targetBranch ?? "main"}'`,
		};
	}

	recordGitPR(prNumber?: number, prUrl?: string): OpResult {
		const git = this.state.git;
		if (!git?.currentBranch) {
			return { ok: false, message: "No active git branch being tracked" };
		}

		this.state = {
			...this.state,
			git: {
				...git,
				step: "PR",
				prNumber: prNumber ?? git.prNumber,
				prUrl: prUrl ?? git.prUrl,
				reviewStatus: "pending",
			},
		};

		const prInfo = prNumber ? `#${prNumber}` : (prUrl ?? "");
		this.commit({
			kind: "git_pr",
			phase: this.state.phase,
			message: `PR ${prInfo} created for branch '${git.currentBranch}'`,
		});

		return {
			ok: true,
			message: `PR ${prInfo} recorded for branch '${git.currentBranch}' (step: PR)`,
		};
	}

	recordGitReview(
		status: "approved" | "changes_requested" | "pending",
	): OpResult {
		const git = this.state.git;
		if (!git?.currentBranch) {
			return { ok: false, message: "No active git branch being tracked" };
		}

		this.state = {
			...this.state,
			git: {
				...git,
				step: "review",
				reviewStatus: status,
			},
		};

		this.commit({
			kind: "git_review",
			phase: this.state.phase,
			message: `Git PR review for '${git.currentBranch}': ${status}`,
		});

		return {
			ok: true,
			message: `PR review status recorded as '${status}' (step: review)`,
		};
	}

	recordGitMerge(): OpResult {
		const git = this.state.git;
		if (!git?.currentBranch) {
			return { ok: false, message: "No active git branch being tracked" };
		}

		const mergedBranch = git.currentBranch;
		const targetBranch = git.targetBranch ?? "main";

		this.state = {
			...this.state,
			git: {
				currentBranch: targetBranch,
				branchType: "main",
				targetBranch,
				step: "merge",
				reviewStatus: "approved",
			},
		};

		this.commit({
			kind: "git_merge",
			phase: this.state.phase,
			message: `Merged branch '${mergedBranch}' into '${targetBranch}'`,
		});

		return {
			ok: true,
			message: `Merged branch '${mergedBranch}' into '${targetBranch}' (current branch now '${targetBranch}')`,
		};
	}

	getGitWorkflowStatus(): string {
		return formatGitWorkflowSummary(this.state.git);
	}

	/**
	 * Auto-detect the current git branch and initialize workflow tracking.
	 * For new projects: call after scaffold to set up git state.
	 * For existing projects: call on session_start to check conformity.
	 *
	 * Returns: { detected, conforms, branchName, type, message }
	 */
	autoDetectGit(): {
		detected: boolean;
		conforms: boolean;
		branchName: string | null;
		type: BranchType | null;
		message: string;
	} {
		// If git is already tracked, skip detection
		if (this.state.git?.currentBranch) {
			const conforms = checkBranchConforms(this.state.git.currentBranch);
			return {
				detected: true,
				conforms: conforms.ok,
				branchName: this.state.git.currentBranch,
				type: this.state.git.branchType ?? null,
				message: `Git already tracked: ${this.state.git.currentBranch} [${this.state.git.branchType}]`,
			};
		}

		// Cannot auto-detect from pure engine — needs shell access.
		// The host (index.ts) must call runner('git branch --show-current')
		// and then call initGitFromBranch() with the result.
		return {
			detected: false,
			conforms: false,
			branchName: null,
			type: null,
			message: "Git branch not yet detected — host must run git detection",
		};
	}

	/**
	 * Initialize git workflow from a detected branch name.
	 * Validates the branch conforms to PRIDES taxonomy.
	 */
	initGitFromBranch(
		branchName: string,
		targetBranch = "main",
	): { ok: boolean; conforms: boolean; message: string } {
		const conforms = checkBranchConforms(branchName);
		const type = conforms.type;

		// Initialize git state even if non-conformant (we want to track it)
		const gitState: GitWorkflowState = {
			currentBranch: branchName.trim(),
			branchType: type,
			targetBranch,
			step: "branch",
			reviewStatus: "pending",
		};

		this.state = { ...this.state, git: gitState };
		this.commit({
			kind: "git_branch",
			phase: this.state.phase,
			message: `Auto-detected branch '${branchName}' [${type}]${conforms.ok ? "" : " — does not follow PRIDES taxonomy"}`,
		});

		if (!conforms.ok) {
			return {
				ok: true,
				conforms: false,
				message: `Branch '${branchName}' tracked [${type}] but ${conforms.reason}`,
			};
		}

		return {
			ok: true,
			conforms: true,
			message: `Branch '${branchName}' tracked [${type}] — follows PRIDES taxonomy`,
		};
	}

	// ---- Report --------------------------------------------------------------

	report(): string;
	report(format: "text"): string;
	report(format: "json"): ReportJson;
	report(format: "text" | "json" = "text"): string | ReportJson {
		const snapshot = this.snapshot();
		if (format === "json") return snapshot;
		return renderReportText(snapshot);
	}

	/** Build a structured, JSON-serializable snapshot of the current session. */
	snapshot(): ReportJson {
		const s = this.state;
		const cfg = getPhaseConfig(s.phase);
		const phaseGates = getGatesForPhase(s.phase, this.defs);
		const open = s.tasks.filter((t) => t.status !== "completed");
		const last = lastGoalCheck(s);
		const failing = phaseGates
			.map((g) => s.gates[g.name])
			.filter((r) => r && r.status === "fail");

		const recs: string[] = [];
		if (s.emergencyStop)
			recs.push(
				"Resolve the emergency and run `prides_emergency_resume` before any further work.",
			);
		if (failing.length)
			recs.push(
				`Fix failing gate(s): ${failing.map((r) => r.name).join(", ")} before advancing.`,
			);
		if (!s.heartbeat)
			recs.push("Record a heartbeat pulse to confirm the agent is healthy.");
		const next = nextPhase(s.phase);
		if (next && failing.length === 0)
			recs.push(`When gates pass, advance to ${next}.`);
		if (recs.length === 0)
			recs.push("All checks green — continue the PRIDES flow.");

		return {
			format: "json",
			phase: s.phase,
			phaseName: cfg.name,
			criticality: cfg.criticality,
			enteredAt: s.phaseEnteredAt,
			emergencyStop: s.emergencyStop,
			goal: s.goal
				? {
						objective: s.goal.objective,
						successCriteria: s.goal.successCriteria,
						nonGoals: s.goal.nonGoals ?? [],
						constraints: s.goal.constraints ?? [],
						setAt: s.goal.setAt,
						lastCheck: last
							? {
									kind: last.kind,
									aligned: last.aligned,
									driftScore: last.driftScore,
									reasoning: last.reasoning,
									checkedAt: last.checkedAt,
								}
							: null,
					}
				: null,
			git: s.git ?? null,
			phaseGates: phaseGates.map((g) => {
				const r = s.gates[g.name];
				return {
					name: g.name,
					type: g.type,
					status: r ? r.status : "not_run",
					message: r?.message ?? null,
					score: r?.score ?? null,
					ranAt: r?.ranAt ?? null,
				};
			}),
			tasks: s.tasks.map((t) => ({
				id: t.id,
				phase: t.phase,
				status: t.status,
				description: t.description,
				createdAt: t.createdAt,
			})),
			tasksOpen: open.length,
			tasksTotal: s.tasks.length,
			heartbeat: s.heartbeat
				? {
						status: s.heartbeat.status,
						intent: s.heartbeat.intent,
						at: s.heartbeat.at,
						stalled: isStalled(s, this.deps.now),
						intervalMs: intervalFor(s.phase),
					}
				: null,
			warnings: s.warnings.map((w) => ({
				id: w.id,
				severity: w.severity,
				category: w.category,
				message: w.message,
				createdAt: w.createdAt,
				resolvedAt: w.resolvedAt ?? null,
			})),
			recommendations: recs,
		};
	}
}

/** Structured, JSON-serializable report snapshot (telemetry export). */
export interface ReportJson {
	format: "json";
	phase: Phase;
	phaseName: string;
	criticality: Criticality;
	enteredAt: number;
	emergencyStop: boolean;
	goal: {
		objective: string;
		successCriteria: string[];
		nonGoals: string[];
		constraints: string[];
		setAt: number;
		lastCheck: {
			kind: "drift" | "verify";
			aligned: boolean;
			driftScore: number;
			reasoning: string;
			checkedAt: number;
		} | null;
	} | null;
	git: GitWorkflowState | null;
	phaseGates: Array<{
		name: string;
		type: GateType;
		status: "pass" | "fail" | "warn" | "pending" | "not_run";
		message: string | null;
		score: number | null;
		ranAt: number | null;
	}>;
	tasks: Array<{
		id: number;
		phase: Phase;
		status: PRIDESTask["status"];
		description: string;
		createdAt: number;
	}>;
	tasksOpen: number;
	tasksTotal: number;
	heartbeat: {
		status: HeartbeatStatus;
		intent: string;
		at: number;
		stalled: boolean;
		intervalMs: number;
	} | null;
	warnings: Array<{
		id: string;
		severity: WarningSeverity;
		category: string;
		message: string;
		createdAt: number;
		resolvedAt: number | null;
	}>;
	recommendations: string[];
}

/** Render the structured snapshot as the original human-readable text report. */
function renderReportText(r: ReportJson): string {
	const lines: string[] = [];
	lines.push(`# PRIDES Session Report`);
	lines.push("");
	lines.push(
		`Phase: ${r.phase} (${r.phaseName}) — ${r.criticality} criticality`,
	);
	lines.push(`Entered: ${new Date(r.enteredAt).toISOString()}`);
	if (r.emergencyStop) lines.push(`⛔ EMERGENCY STOP ACTIVE`);
	lines.push("");

	if (r.goal) {
		lines.push(`## Goal`);
		lines.push(`  Objective: ${r.goal.objective}`);
		lines.push(`  Success criteria: ${r.goal.successCriteria.join("; ")}`);
		if (r.goal.lastCheck) {
			lines.push(
				`  Last check: ${r.goal.lastCheck.kind} — aligned=${r.goal.lastCheck.aligned} score=${r.goal.lastCheck.driftScore}`,
			);
		} else {
			lines.push(`  Last check: none`);
		}
		lines.push("");
	}

	lines.push(`## Git Workflow`);
	lines.push(
		`  ${formatGitWorkflowSummary(r.git ?? undefined).replace(/\n/g, "\n  ")}`,
	);
	lines.push("");

	lines.push(`## Quality gates (phase ${r.phase})`);
	if (r.phaseGates.length === 0) {
		lines.push(`  (none defined for this phase)`);
	} else {
		for (const g of r.phaseGates) {
			const mark =
				g.status === "pass"
					? "✓"
					: g.status === "fail"
						? "✗"
						: g.status === "not_run"
							? "?"
							: "•";
			lines.push(`  ${mark} ${g.name} — ${g.status}`);
		}
	}
	lines.push("");

	lines.push(`## Tasks`);
	lines.push(`  ${r.tasksOpen} open / ${r.tasksTotal} total`);
	for (const t of r.tasks) {
		lines.push(
			`  [${t.status === "completed" ? "x" : " "}] #${t.id} (${t.phase}) ${t.description}`,
		);
	}
	lines.push("");

	lines.push(`## Heartbeat`);
	if (r.heartbeat) {
		lines.push(
			`  Last: ${r.heartbeat.status} @ ${new Date(r.heartbeat.at).toISOString()}`,
		);
		lines.push(
			`  Interval: ${r.heartbeat.intervalMs}ms — ${r.heartbeat.stalled ? "STALLED" : "within budget"}`,
		);
	} else {
		lines.push(`  No pulse recorded yet`);
	}
	lines.push("");

	lines.push(`## Recommendations`);
	for (const rec of r.recommendations) lines.push(`  - ${rec}`);

	return lines.join("\n");
}
