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
	formatGitWorkflowSummary,
	validateBranchName,
} from "./gitWorkflow.js";
import {
	classifyPulse,
	intervalFor,
	isStalled,
	makePulse,
} from "./heartbeat.js";
import {
	canAdvance,
	getPhaseConfig,
	isCritical,
	nextPhase,
	validateSetPhase,
} from "./phases.js";
import { type ScaffoldFile, scaffoldPlan } from "./scaffold.js";
import { createInitialState, recordEvent } from "./state.js";
import type {
	Artifact,
	BranchType,
	Clock,
	GateDef,
	GateResult,
	GateRunner,
	GitWorkflowState,
	GitWorkflowStep,
	Globber,
	HeartbeatPulse,
	Judge,
	Phase,
	PRIDESAuditEvent,
	PRIDESState,
	ProjectIntent,
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

	// ---- Report --------------------------------------------------------------

	report(): string {
		const s = this.state;
		const cfg = getPhaseConfig(s.phase);
		const lines: string[] = [];
		lines.push(`# PRIDES Session Report`);
		lines.push("");
		lines.push(
			`Phase: ${s.phase} (${cfg.name}) — ${cfg.criticality} criticality`,
		);
		lines.push(`Entered: ${new Date(s.phaseEnteredAt).toISOString()}`);
		if (s.emergencyStop) lines.push(`⛔ EMERGENCY STOP ACTIVE`);
		lines.push("");

		lines.push(`## Git Workflow`);
		lines.push(`  ${formatGitWorkflowSummary(s.git).replace(/\n/g, "\n  ")}`);
		lines.push("");

		lines.push(`## Quality gates (phase ${s.phase})`);
		const phaseGates = getGatesForPhase(s.phase, this.defs);
		if (phaseGates.length === 0) {
			lines.push(`  (none defined for this phase)`);
		} else {
			for (const g of phaseGates) {
				const r = s.gates[g.name];
				const mark = r
					? r.status === "pass"
						? "✓"
						: r.status === "fail"
							? "✗"
							: "•"
					: "?";
				lines.push(`  ${mark} ${g.name} — ${r ? r.status : "not run"}`);
			}
		}
		lines.push("");

		lines.push(`## Tasks`);
		const open = s.tasks.filter((t) => t.status !== "completed");
		lines.push(`  ${open.length} open / ${s.tasks.length} total`);
		for (const t of s.tasks) {
			lines.push(
				`  [${t.status === "completed" ? "x" : " "}] #${t.id} (${t.phase}) ${t.description}`,
			);
		}
		lines.push("");

		lines.push(`## Heartbeat`);
		if (s.heartbeat) {
			const stalled = isStalled(s, this.deps.now);
			lines.push(
				`  Last: ${s.heartbeat.status} @ ${new Date(s.heartbeat.at).toISOString()}`,
			);
			lines.push(
				`  Interval: ${intervalFor(s.phase)}ms — ${stalled ? "STALLED" : "within budget"}`,
			);
		} else {
			lines.push(`  No pulse recorded yet`);
		}
		lines.push("");

		lines.push(`## Recommendations`);
		const recs: string[] = [];
		if (s.emergencyStop)
			recs.push(
				"Resolve the emergency and run `prides_emergency_resume` before any further work.",
			);
		const failing = phaseGates
			.map((g) => s.gates[g.name])
			.filter((r) => r && r.status === "fail");
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
		for (const r of recs) lines.push(`  - ${r}`);

		return lines.join("\n");
	}

	// ---- Guards (host helper) ----------------------------------------------

	isCriticalPhase(): boolean {
		return isCritical(this.state.phase);
	}

	hasBlockingGates(): boolean {
		return canAdvance(this.state, this.defs).ok === false;
	}
}
