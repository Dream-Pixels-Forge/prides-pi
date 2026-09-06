/**
 * pi-prides — PRIDES governance extension for pi
 *
 * Wires the pure engine (./engine) to pi's ExtensionAPI:
 *  - 20 tools the LLM can call (phase, gates, heartbeat, emergency stop,
 *    tasks, artifacts, scaffold, report, git workflow)
 *  - a `/prides` command tree for manual control
 *  - write/session guards that enforce the methodology
 *  - heartbeat monitoring + event-sourced state persisted to the session
 *  - contributes the bundled skills/ and prompts/ as discoverable resources
 *
 * All heavy logic lives in the pure modules so it can be unit-tested without pi.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	type BashOperations,
	createLocalBashOperations,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { PRIDESEngine } from "./engine.js";
import { DEFAULT_GATES } from "./gates.js";
import { driftSeverity, shouldRunDriftCheck } from "./goal.js";
import { assessStaleness, stalledReason } from "./heartbeat.js";
import { canAdvance, isCritical, PHASE_CONFIG, PHASE_ORDER } from "./phases.js";
import { generatePlan, renderPlanMarkdown } from "./plan.js";
import { shQuote } from "./shell.js";
import { createInitialState } from "./state.js";
import type { IssueCounts } from "./status.js";
import type {
	BranchType,
	CommandResult,
	GateDef,
	GateResult,
	Globber,
	Judge,
	Phase,
	PRIDESState,
	ProjectIntent,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- Injected runtime dependencies -----------------------------------------

const now = (): number => Date.now();

// pi is assigned in the default export; used for appendEntry + flags.
let piRef: ExtensionAPI;

// pi's `exec()` API spawns with `shell: false`, so a full command string like
// `npm run test:unit` (or any `a || b` pipeline) is treated as an executable
// *name and fails with ENOENT (code 1) on every platform — verified against
// pi-coding-agent 0.74.2 and 0.81.0. Gates and git hooks need real shell
// semantics (pipelines, `&&`/`||`, npm.cmd shims on Windows), so we run them
// through pi's own local bash backend — the same engine as the built-in bash
// tool (bash on POSIX, Git Bash on Windows), with timeout + abort support.
const bashOps: BashOperations = createLocalBashOperations();

const runner = async (
	command: string,
	cwd: string,
	env?: NodeJS.ProcessEnv,
): Promise<CommandResult> => {
	try {
		const chunks: Buffer[] = [];
		const { exitCode } = await bashOps.exec(command, cwd, {
			timeout: 120,
			env,
			onData: (d) => chunks.push(d),
		});
		const output = Buffer.concat(chunks).toString("utf8").trim();
		return {
			// null exit code means the process was killed (timeout/abort)
			code: exitCode === null ? 130 : exitCode,
			stdout: output,
			stderr: "",
		};
	} catch (e) {
		return { code: 1, stdout: "", stderr: String(e) };
	}
};

const globber: Globber = async (
	pattern: string,
	cwd: string,
): Promise<string[]> => {
	try {
		const fsModule = await import("node:fs");
		const matches = await (
			fsModule as unknown as {
				glob: (
					p: string,
					o: { cwd: string; nodir: boolean },
				) => Promise<string[]>;
			}
		).glob(pattern, { cwd, nodir: true });
		return matches ?? [];
	} catch {
		return [];
	}
};

// Git branch detection helper. Runs 'git branch --show-current' and returns the
// current branch name, or null if not in a git repo.
async function detectGitBranch(cwd: string): Promise<string | null> {
	try {
		const res = await runner("git branch --show-current", cwd);
		if (res.code === 0 && res.stdout.trim()) {
			return res.stdout.trim();
		}
	} catch {
		// not a git repo or git not installed
	}
	return null;
}

// LLM-as-judge for `eval` gates. Safe + configurable: set PRIDES_EVAL_CMD to a
// command that receives the rubric as a shell-quoted argument and exits
// 0 (pass) / 1 (fail) / 2 (warn). Degrades to `warn` (non-blocking) when unset.
//
// The rubric comes from the (repo-controlled) gate definition, so it is
// UNTRUSTED input. `shQuote` (POSIX single-quote escaping) makes it inert in
// pi's shell (bash / Git Bash); `JSON.stringify` alone is NOT shell quoting
// (`$(...)`, backticks and `;` survive inside double quotes).
function makeJudge(_ctx: ExtensionContext): Judge {
	return async (prompt, c) => {
		const cmd = process.env.PRIDES_EVAL_CMD;
		if (!cmd) {
			return {
				status: "warn",
				message: "eval judge not configured (set PRIDES_EVAL_CMD)",
			};
		}
		try {
			const res = await runner(`${cmd} ${shQuote(prompt)}`, c.cwd);
			const status = res.code === 0 ? "pass" : res.code === 2 ? "warn" : "fail";
			return {
				status,
				message: (res.stdout || res.stderr || "no output").trim().slice(0, 800),
			};
		} catch (e) {
			return {
				status: "warn",
				message: `eval judge error: ${String(e).slice(0, 200)}`,
			};
		}
	};
}

// --- Engine + persistence ---------------------------------------------------

let engine: PRIDESEngine | undefined;
let currentDefs: GateDef[] = DEFAULT_GATES;
let opLock: Promise<unknown> = Promise.resolve();
let lastPersistedJson: string | null = null;

const PERSIST_EVENT_CAP = 50;

/** Persisted snapshots are append-only and accumulate, so trim the audit
 *  trail to the most recent events before writing. The in-memory engine keeps
 *  the full trail (capped at MAX_EVENTS in state.ts); only the on-disk copy is
 *  truncated, an acceptable trade-off for reload continuity. */
export function slimState(state: PRIDESState): PRIDESState {
	if (state.events.length <= PERSIST_EVENT_CAP) return state;
	return {
		...state,
		events: state.events.slice(state.events.length - PERSIST_EVENT_CAP),
	};
}

async function loadDefs(cwd: string): Promise<GateDef[]> {
	try {
		const raw = await readFile(
			resolve(cwd, ".prides/gates.config.json"),
			"utf8",
		);
		const parsed = JSON.parse(raw) as { gates?: GateDef[] };
		if (Array.isArray(parsed.gates) && parsed.gates.length > 0)
			return parsed.gates;
	} catch {
		/* use defaults */
	}
	return DEFAULT_GATES;
}

/** Read GitHub-style counts from `.prides/counts.json` (created by
 *  `prides_counts_update`). Falls back to zeros when missing or malformed. */
export async function loadCounts(cwd: string): Promise<IssueCounts> {
	const empty: IssueCounts = {
		issuesOpened: 0,
		issuesClosed: 0,
		prsOpened: 0,
		prsClosed: 0,
		prsMerged: 0,
	};
	try {
		const raw = await readFile(resolve(cwd, ".prides/counts.json"), "utf8");
		const parsed = JSON.parse(raw) as Partial<IssueCounts>;
		return {
			issuesOpened: num(parsed.issuesOpened),
			issuesClosed: num(parsed.issuesClosed),
			prsOpened: num(parsed.prsOpened),
			prsClosed: num(parsed.prsClosed),
			prsMerged: num(parsed.prsMerged),
		};
	} catch {
		return empty;
	}
}
function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}
function clampN(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v)
		? Math.max(0, Math.floor(v))
		: 0;
}

let cachedCounts: IssueCounts = {
	issuesOpened: 0,
	issuesClosed: 0,
	prsOpened: 0,
	prsClosed: 0,
	prsMerged: 0,
};

export function loadState(ctx: ExtensionContext): PRIDESState {
	let data: PRIDESState | undefined;
	// getBranch() is ordered oldest -> newest, so the LAST match is the newest
	// snapshot. Keep it (do NOT return on the first match, or state reverts to
	// the oldest snapshot after a reload / branch navigation).
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "prides-state") {
			const d = entry.data as PRIDESState | undefined;
			if (d && d.version === 1) data = d;
		}
	}
	return data ?? createInitialState(now);
}

async function initEngine(ctx: ExtensionContext): Promise<void> {
	currentDefs = await loadDefs(ctx.cwd);
	cachedCounts = await loadCounts(ctx.cwd);
	engine = new PRIDESEngine(loadState(ctx), {
		runner,
		globber,
		now,
		cwd: ctx.cwd,
		defs: currentDefs,
		judge: makeJudge(ctx),
	});
	lastPersistedJson = JSON.stringify(slimState(engine.serialize()));
	updateWidget(ctx);
}

function ensureEngine(ctx: ExtensionContext): Promise<void> {
	if (engine) return Promise.resolve();
	return initEngine(ctx);
}

function persist(): void {
	if (!engine) return;
	const snapshot = slimState(engine.serialize());
	const json = JSON.stringify(snapshot);
	// getBranch() is append-only (pi exposes no prune/upsert API), so avoid
	// writing a fresh full snapshot when nothing changed: every read-only or
	// repeated call would otherwise duplicate the entire state in the session.
	if (json === lastPersistedJson) return;
	piRef.appendEntry("prides-state", snapshot);
	lastPersistedJson = json;
}

function updateWidget(ctx: ExtensionContext): void {
	if (!engine || !ctx.hasUI) return;
	// Live status snapshot drives both the widget AND any tool that surfaces it.
	const status = engine.getStatus(cachedCounts);
	ctx.ui.setWidget("prides", status.widgetLines);
}

/** Serialize engine mutations and persist after each operation. */
function runOp<T>(
	ctx: ExtensionContext,
	fn: (e: PRIDESEngine) => Promise<T> | T,
): Promise<T> {
	const run = async (): Promise<T> => {
		await ensureEngine(ctx);
		const res = await fn(engine as PRIDESEngine);
		persist();
		updateWidget(ctx);
		return res;
	};
	const next = opLock.then(run, run);
	opLock = next.then(
		() => undefined,
		() => undefined,
	);
	return next;
}

// --- Rendering helpers ------------------------------------------------------

function gateLine(theme: Theme, r: GateResult): string {
	const mark =
		r.status === "pass"
			? theme.fg("success", "✓")
			: r.status === "fail"
				? theme.fg("error", "✗")
				: theme.fg("dim", "•");
	return `${mark} ${theme.fg("accent", r.name)} — ${theme.fg("muted", r.status)} ${theme.fg("dim", r.message)}`;
}

// ===========================================================================
// Extension entry
// ===========================================================================

export default function (pi: ExtensionAPI) {
	piRef = pi;

	// --- Lifecycle -----------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		await initEngine(ctx);
		const phase = engine?.state.phase ?? "P";

		// For existing projects: detect git branch and check PRIDES taxonomy
		if (engine && !engine.state.git?.currentBranch) {
			const branch = await detectGitBranch(ctx.cwd);
			if (branch) {
				const result = engine.initGitFromBranch(branch);
				if (!result.conforms) {
					ctx.ui.notify(`PRIDES: ${result.message}`, "warning");
				} else {
					ctx.ui.notify(
						`PRIDES active — phase ${phase} (${PHASE_CONFIG[phase].name}) · branch: ${branch}`,
						"info",
					);
				}
				persist();
			} else {
				ctx.ui.notify(
					`PRIDES active — phase ${phase} (${PHASE_CONFIG[phase].name})`,
					"info",
				);
			}
		} else {
			ctx.ui.notify(
				`PRIDES active — phase ${phase} (${PHASE_CONFIG[phase].name})`,
				"info",
			);
		}
	});

	pi.on("session_tree", async (_event, ctx) => {
		await initEngine(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		await ensureEngine(ctx);
		const s = engine?.state;
		if (!s) return;
		const line = `\n[PRIDES] Phase ${s.phase} (${PHASE_CONFIG[s.phase].name})${s.emergencyStop ? " — EMERGENCY STOPPED" : ""}. Respect phase gates; use prides_* tools to track state.`;
		return { systemPrompt: event.systemPrompt + line };
	});

	// --- Resource discovery: contribute bundled skills + prompts ------------
	// Skills and prompts live at the repo root (skills/, prompts/) which is
	// two levels up from HERE = extensions/prides/. Without the correct path
	// the bundled PRIDES skills and prompts are silently missing after
	// `pi install`.

	pi.on("resources_discover", async () => ({
		skillPaths: [resolve(HERE, "../../skills")],
		promptPaths: [resolve(HERE, "../../prompts")],
	}));

	// --- Flags ---------------------------------------------------------------

	pi.registerFlag("prides-guard", {
		description:
			"Enable PRIDES write guards (blocks writes in Review/Deploy/Secure)",
		type: "boolean",
		default: true,
	});
	pi.registerFlag("prides-lax", {
		description: "Disable PRIDES write guards entirely",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("prides-force", {
		description: "Force session switch/fork past PRIDES guards",
		type: "boolean",
		default: false,
	});

	// --- Guards --------------------------------------------------------------

	const MUTATING = new Set(["write", "edit", "bash"]);
	const GUARD_PHASES = new Set<Phase>(["R", "D", "S"]);

	// Git commands that should be blocked by PRIDES guards
	const GIT_BLOCK = new Set([
		"git commit",
		"git push",
		"git push origin",
		"git push -u",
		"git push --force",
		"gh pr create",
		"gh pr merge",
	]);

	pi.on("tool_call", async (event, ctx) => {
		const name = event.toolName;
		if (!name || name.startsWith("prides_")) return { block: false }; // never block our own tools
		await ensureEngine(ctx);
		const s = engine?.state;
		if (!s) return { block: false };

		const guardOn = pi.getFlag("prides-guard") !== false;
		const lax = pi.getFlag("prides-lax") === true;
		if (!guardOn || lax) return { block: false };

		// Emergency stop blocks all mutations
		if (s.emergencyStop && MUTATING.has(name)) {
			return {
				block: true,
				reason: "PRIDES emergency stop active — no mutations allowed",
			};
		}

		// Phase-based write guard
		if (GUARD_PHASES.has(s.phase) && (name === "write" || name === "edit")) {
			return {
				block: true,
				reason: `PRIDES guard: file writes are blocked during the ${s.phase} (${PHASE_CONFIG[s.phase].name}) phase. Advance to Implement with /prides next, or disable with --prides-lax.`,
			};
		}

		// Block git commit/push when there are issues
		if (name === "bash" && engine) {
			const toolInput = (event as { toolInput?: Record<string, unknown> })
				?.toolInput;
			const cmd = String(toolInput?.command ?? "");

			// Check if this is a git operation that should be blocked
			const isGitOp = [...GIT_BLOCK].some((op) => cmd.startsWith(op));
			if (isGitOp) {
				const check = engine.shouldBlockGitOps();
				if (check.blocked) {
					return {
						block: true,
						reason: `PRIDES guard: git operations blocked — ${check.reason}. Fix issues first or use --prides-lax to override.`,
					};
				}
			}
		}

		return { block: false };
	});

	async function sessionGuard(
		ctx: ExtensionContext,
	): Promise<{ cancel: boolean }> {
		await ensureEngine(ctx);
		const s = engine?.state;
		if (!s) return { cancel: false };
		if (pi.getFlag("prides-force") === true) return { cancel: false };
		if (s.emergencyStop) {
			ctx.ui.notify(
				"PRIDES: switch blocked — emergency stop active",
				"warning",
			);
			return { cancel: true };
		}
		if (isCritical(s.phase)) {
			const check = canAdvance(s, engine?.defs ?? DEFAULT_GATES);
			if (!check.ok) {
				ctx.ui.notify(
					`PRIDES: switch blocked — phase ${s.phase} has failing gates. Set --prides-force to override.`,
					"warning",
				);
				return { cancel: true };
			}
		}
		return { cancel: false };
	}

	pi.on("session_before_switch", async (_event, ctx) => {
		const r = await sessionGuard(ctx);
		return { cancel: r.cancel };
	});
	pi.on("session_before_fork", async (_event, ctx) => {
		const r = await sessionGuard(ctx);
		return { cancel: r.cancel };
	});

	// --- Tools ---------------------------------------------------------------

	pi.registerTool({
		name: "prides_status",
		label: "PRIDES Status",
		description:
			"Show current PRIDES phase (with sequence position), gate counts, task counts, heartbeat, drift score, warnings, GitHub-style issue/PR counts, and emergency-stop state.",
		promptSnippet: "Show current PRIDES phase, gates, heartbeat, and tasks",
		promptGuidelines: [
			"Use prides_status to report the current SDLC phase and gate health before proposing phase changes.",
			"Pass format='json' to get the structured status snapshot for programmatic use.",
		],
		parameters: Type.Object({
			format: Type.Optional(
				StringEnum(["text", "json"] as const, {
					description:
						"Output format. 'text' (default) returns human-readable lines; 'json' returns the structured StatusSnapshot (phase/gates/tasks/heartbeat/drift/warnings/counts).",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const format = (params as { format?: "text" | "json" }).format ?? "text";
			return runOp(ctx, (e) => {
				const status = e.getStatus(cachedCounts);
				if (format === "json") {
					return {
						content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
						details: { status, state: e.state },
					};
				}
				const lines = [...status.widgetLines];
				if (status.phase === "S") {
					lines.push("");
					lines.push("Final phase reached.");
				}
				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: { status, state: e.state },
				};
			});
		},
		renderCall() {
			return new Text("prides_status", 0, 0);
		},
		renderResult(result, _options, theme) {
			const status = (
				result.details as
					| { status?: ReturnType<PRIDESEngine["getStatus"]> }
					| undefined
			)?.status;
			if (!status) {
				return new Text(
					result.content[0]?.type === "text" ? result.content[0].text : "",
					0,
					0,
				);
			}
			let t =
				theme.fg("accent", `PRIDES ${status.phase}`) +
				theme.fg("muted", ` · ${status.phaseName}`) +
				theme.fg("dim", `  (${status.phaseProgress})`);
			if (status.emergencyStop) t += theme.fg("error", "  ⛔ STOP");
			t +=
				"\n" +
				theme.fg("dim", status.progressBar) +
				"\n" +
				theme.fg(
					"dim",
					`tasks ${status.tasksOpen}/${status.tasksTotal} · gates ${status.gatesPass}/${status.gatesTotal} pass` +
						(status.gatesFail ? ` (${status.gatesFail} fail)` : "") +
						` · hb: ${status.heartbeatStatus ?? "—"}`,
				);
			if (status.driftSeverity !== "ok") {
				t +=
					"\n" +
					theme.fg(
						status.driftSeverity === "stop" ? "error" : "warning",
						`⚠ drift ${status.driftScore?.toFixed(2)} (${status.driftSeverity})`,
					);
			}
			return new Text(t, 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_counts_update",
		label: "PRIDES Counts Update",
		description:
			"Update the local GitHub-style counts (issues opened/closed, PRs opened/closed/merged) stored in `.prides/counts.json`. Use after fetching live counts from the gh CLI or after a manual reconciliation.",
		promptSnippet: "Update PRIDES local GitHub-style counts",
		promptGuidelines: [
			"Use prides_counts_update after running `gh issue list --state all --json number` etc., to keep the widget accurate.",
		],
		parameters: Type.Object({
			issuesOpened: Type.Optional(Type.Number()),
			issuesClosed: Type.Optional(Type.Number()),
			prsOpened: Type.Optional(Type.Number()),
			prsClosed: Type.Optional(Type.Number()),
			prsMerged: Type.Optional(Type.Number()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const p = params as Partial<IssueCounts>;
				const next: IssueCounts = {
					issuesOpened: clampN(p.issuesOpened ?? cachedCounts.issuesOpened),
					issuesClosed: clampN(p.issuesClosed ?? cachedCounts.issuesClosed),
					prsOpened: clampN(p.prsOpened ?? cachedCounts.prsOpened),
					prsClosed: clampN(p.prsClosed ?? cachedCounts.prsClosed),
					prsMerged: clampN(p.prsMerged ?? cachedCounts.prsMerged),
				};
				await writeFile(
					resolve(ctx.cwd, ".prides/counts.json"),
					JSON.stringify(next, null, 2),
					"utf8",
				);
				cachedCounts = next;
				const status = e.getStatus(cachedCounts);
				return {
					content: [
						{
							type: "text",
							text: `Counts updated — issues ${next.issuesOpened - next.issuesClosed} open · PRs ${next.prsOpened - next.prsClosed} open`,
						},
					],
					details: { counts: next, status },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_plan",
		label: "PRIDES Generate Plan",
		description:
			"Generate a goal-enforced implementation plan covering every PRIDES phase. Writes `dev_notes/PLAN_AUTO.md` and returns the rendered markdown. Re-call after any change to goal or task list.",
		promptSnippet: "Generate a goal-enforced PRIDES plan",
		promptGuidelines: [
			"Use prides_plan immediately after setting the goal to materialize a phase-by-phase plan.",
			"Re-run after goal or task-list changes to refresh the plan.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const plan = generatePlan(e.state, currentDefs);
				const md = renderPlanMarkdown(plan, e.state);
				await writeFile(resolve(ctx.cwd, "dev_notes/PLAN_AUTO.md"), md, "utf8");
				return {
					content: [
						{
							type: "text",
							text: `Plan written to dev_notes/PLAN_AUTO.md (${plan.length} phases)`,
						},
					],
					details: { plan, markdown: md },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_phase_advance",
		label: "PRIDES Advance",
		description:
			"Advance to the next PRIDES phase. Validates that current-phase gates pass (use force to override).",
		promptSnippet: "Advance to the next PRIDES phase (validates gates)",
		promptGuidelines: [
			"Use prides_phase_advance after current-phase quality gates pass; it enforces the P→R→I→D→E→S linear flow.",
		],
		parameters: Type.Object({
			force: Type.Optional(
				Type.Boolean({ description: "Override failing gates" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.advance(params.force ?? false);
				return {
					content: [{ type: "text", text: r.message }],
					details: { ok: r.ok, next: r.next, state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { ok?: boolean } | undefined;
			const msg =
				result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(theme.fg(d?.ok ? "success" : "error", msg), 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_phase_set",
		label: "PRIDES Set Phase",
		description:
			"Explicitly set the PRIDES phase (P/R/I/D/E/S). Requires current gates to pass unless force is used.",
		promptSnippet: "Set the PRIDES phase explicitly",
		promptGuidelines: [
			"Use prides_phase_set to jump to a specific phase; it still requires current-phase gates unless forced.",
		],
		parameters: Type.Object({
			phase: StringEnum(PHASE_ORDER),
			force: Type.Optional(
				Type.Boolean({ description: "Override gate checks" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.setPhase(params.phase as Phase, params.force ?? false);
				return {
					content: [{ type: "text", text: r.message }],
					details: { ok: r.ok, state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { ok?: boolean } | undefined;
			const msg =
				result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(theme.fg(d?.ok ? "success" : "error", msg), 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_gate",
		label: "PRIDES Run Gate",
		description:
			"Run a single quality gate by name (e.g. test-unit, linter, security) for the current project. For manual gates, pass approve:true to record human sign-off.",
		promptSnippet: "Run a single named PRIDES quality gate",
		promptGuidelines: [
			"Use prides_gate to evaluate one quality gate (e.g. 'security', 'linter') and record the result.",
			"For manual gates, use prides_gate with approve:true to record human sign-off (required before advancing).",
		],
		parameters: Type.Object({
			name: Type.String({
				description: "Gate name, e.g. test-unit, linter, security, review",
			}),
			approve: Type.Optional(
				Type.Boolean({
					description:
						"Record human sign-off for a manual gate (sets it to pass). Ignored for non-manual gates.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				if (params.approve) {
					const r = e.approveGate(params.name);
					const text = r.ok
						? `Gate ${params.name} signed off (pass)`
						: `Cannot sign off ${params.name}: ${r.message}`;
					return {
						content: [{ type: "text", text }],
						details: { result: r.result, state: e.state },
					};
				}
				return (async () => {
					const r = await e.runGate(params.name);

					// Auto-generate warning when gate fails
					if (r.ok && r.result.status === "fail") {
						e.addWarning(
							"error",
							"gate-failure",
							`Gate '${r.result.name}' failed: ${r.result.message}`,
						);
					} else if (r.ok && r.result.status === "warn") {
						e.addWarning(
							"warn",
							"gate-warning",
							`Gate '${r.result.name}' warned: ${r.result.message}`,
						);
					} else if (r.ok && r.result.status === "pass") {
						// Auto-resolve any existing warnings for this gate
						for (const w of e.getActiveWarnings()) {
							if (
								(w.category === "gate-failure" ||
									w.category === "gate-warning") &&
								w.message.includes(r.result.name)
							) {
								e.resolveWarning(w.id);
							}
						}
					}

					const text = r.ok
						? `Gate ${r.result.name}: ${r.result.status} — ${r.result.message}`
						: `Unknown gate: ${params.name}`;
					return {
						content: [{ type: "text", text }],
						details: { result: r.result, state: e.state },
					};
				})();
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { result?: GateResult } | undefined;
			if (!d?.result) {
				return new Text(
					result.content[0]?.type === "text" ? result.content[0].text : "",
					0,
					0,
				);
			}
			return new Text(gateLine(theme, d.result), 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_gates",
		label: "PRIDES Run All Gates",
		description:
			"Run every quality gate defined for the current phase and report a summary.",
		promptSnippet: "Run all PRIDES quality gates for the current phase",
		promptGuidelines: [
			"Use prides_gates to evaluate all gates for the current phase before advancing.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const results = await e.runGates();

				// Auto-generate warnings for all failing/warned gates
				for (const r of results) {
					if (r.status === "fail") {
						e.addWarning(
							"error",
							"gate-failure",
							`Gate '${r.name}' failed: ${r.message}`,
						);
					} else if (r.status === "warn") {
						e.addWarning(
							"warn",
							"gate-warning",
							`Gate '${r.name}' warned: ${r.message}`,
						);
					} else if (r.status === "pass") {
						// Auto-resolve any existing warnings for this gate
						for (const w of e.getActiveWarnings()) {
							if (
								(w.category === "gate-failure" ||
									w.category === "gate-warning") &&
								w.message.includes(r.name)
							) {
								e.resolveWarning(w.id);
							}
						}
					}
				}

				const text =
					results
						.map((r) => `${r.name}: ${r.status} (${r.message})`)
						.join("\n") || "No gates for phase";
				return {
					content: [{ type: "text", text }],
					details: { results, state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { results?: GateResult[] } | undefined;
			if (!d?.results || d.results.length === 0) {
				return new Text(theme.fg("dim", "no gates for phase"), 0, 0);
			}
			return new Text(
				d.results.map((r) => gateLine(theme, r)).join("\n"),
				0,
				0,
			);
		},
	});

	pi.registerTool({
		name: "prides_heartbeat",
		label: "PRIDES Heartbeat",
		description:
			"Record a health pulse for the current phase with the agent's current intent.",
		promptSnippet: "Record a PRIDES heartbeat pulse",
		promptGuidelines: [
			"Use prides_heartbeat periodically to confirm the agent is healthy and on-intent.",
			"In critical phases (I, D, S), record heartbeats frequently to detect stalls early.",
			"When STALLED, check prides_task_list for incomplete tasks that may be blocked.",
		],
		parameters: Type.Object({
			intent: Type.String({
				description: "What the agent is currently working on",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const pulse = e.heartbeat(params.intent);
				const stallCtx = assessStaleness(e.state, now);
				const reason = stalledReason(e.state, now);

				let text = `Heartbeat: ${pulse.status}`;
				if (reason) text += ` — ${reason}`;

				if (e.state.goal && shouldRunDriftCheck(e.state, now())) {
					const check = await e.checkGoalDrift();
					if ("aligned" in check && !check.aligned) {
						text += `\n⚠ Goal drift detected (${check.driftScore}): ${check.reasoning}`;
					}
				}

				return {
					content: [{ type: "text", text }],
					details: {
						pulse,
						stalled: stallCtx,
						state: e.state,
					},
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as
				| {
						pulse?: { status: string };
						stalled?: { incompleteTaskCount: number };
				  }
				| undefined;
			const status = d?.pulse?.status ?? "?";
			const color =
				status === "HEALTHY"
					? "success"
					: status === "STALLED"
						? "error"
						: "warning";
			let text = theme.fg(color, `♥ ${status}`);
			if (d?.stalled?.incompleteTaskCount) {
				text += theme.fg("dim", ` (${d.stalled.incompleteTaskCount} open)`);
			}
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_emergency_stop",
		label: "PRIDES Emergency Stop",
		description:
			"Halt all mutations immediately and signal the human governor. Cleared via prides_emergency_resume.",
		promptSnippet: "Trigger PRIDES emergency stop",
		promptGuidelines: [
			"Use prides_emergency_stop only on critical failure; it blocks all mutating tools until resumed.",
		],
		parameters: Type.Object({
			reason: Type.String({ description: "Why the stop was triggered" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				e.emergencyStop(params.reason);
				return {
					content: [{ type: "text", text: `EMERGENCY STOP: ${params.reason}` }],
					details: { state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			return new Text(
				theme.fg(
					"error",
					result.content[0]?.type === "text"
						? result.content[0].text
						: "EMERGENCY STOP",
				),
				0,
				0,
			);
		},
	});

	pi.registerTool({
		name: "prides_emergency_resume",
		label: "PRIDES Resume",
		description: "Clear the emergency stop so work can continue.",
		promptSnippet: "Clear the PRIDES emergency stop",
		promptGuidelines: [
			"Use prides_emergency_resume only after the emergency has been resolved by a human.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				e.emergencyResume();
				return {
					content: [{ type: "text", text: "Emergency stop cleared" }],
					details: { state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_artifact",
		label: "PRIDES Log Artifact",
		description:
			"Log a phase artifact (PRD, plan, report, etc.) to the audit trail.",
		promptSnippet: "Log a PRIDES phase artifact",
		promptGuidelines: [
			"Use prides_artifact to record deliverables produced in the current phase.",
		],
		parameters: Type.Object({
			kind: Type.String({
				description: "Artifact kind, e.g. prd, plan, report",
			}),
			path: Type.Optional(Type.String({ description: "Optional file path" })),
			note: Type.Optional(Type.String({ description: "Optional note" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const a = e.addArtifact({
					phase: e.state.phase,
					kind: params.kind,
					path: params.path,
					note: params.note,
				});
				return {
					content: [
						{
							type: "text",
							text: `Artifact logged: ${a.kind}${a.path ? ` (${a.path})` : ""}`,
						},
					],
					details: { artifact: a, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_scaffold",
		label: "PRIDES Scaffold",
		description:
			"Generate the .prides/ directory, intent.json, and dev_notes/ docs for a project.",
		promptSnippet: "Scaffold a PRIDES project structure",
		promptGuidelines: [
			"Use prides_scaffold at the start of a new project to create the PRIDES folder layout and intent.json.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "Project name" }),
			purpose: Type.String({ description: "One-line project purpose" }),
			stack: Type.Optional(Type.String({ description: "Technology stack" })),
			repository: Type.Optional(Type.String({ description: "Repository URL" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const intent: ProjectIntent = {
					name: params.name,
					purpose: params.purpose,
					stack: params.stack,
					repository: params.repository,
				};
				e.setIntent(intent);
				const files = e.planScaffold(intent);
				const created: string[] = [];
				for (const f of files) {
					const full = resolve(ctx.cwd, f.path);
					await mkdir(dirname(full), { recursive: true });
					await writeFile(full, f.content, "utf8");
					created.push(f.path);
				}

				// Auto-detect git branch and initialize workflow tracking
				const branch = await detectGitBranch(ctx.cwd);
				let gitMsg = "";
				if (branch) {
					const gitResult = e.initGitFromBranch(branch);
					gitMsg = `\nBranch: ${branch} — ${gitResult.message}`;
				} else {
					gitMsg = "\nGit: not detected (not a git repo or git not installed)";
				}

				return {
					content: [
						{
							type: "text",
							text: `Scaffolded ${created.length} files (intent: ${intent.name})${gitMsg}`,
						},
					],
					details: { created, state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { created?: string[] } | undefined;
			const n = d?.created?.length ?? 0;
			return new Text(theme.fg("success", `✓ scaffolded ${n} file(s)`), 0, 0);
		},
	});

	pi.registerTool({
		name: "prides_report",
		label: "PRIDES Report",
		description:
			"Produce a full session report with gate, task, heartbeat status and recommendations.",
		promptSnippet: "Generate a PRIDES session report",
		promptGuidelines: [
			"Use prides_report to summarize session health and next recommended actions.",
			"Pass format='json' to get a structured snapshot for telemetry or external tooling.",
		],
		parameters: Type.Object({
			format: Type.Optional(
				StringEnum(["text", "json"] as const, {
					description:
						"Output format. 'text' (default) returns the human-readable markdown report; 'json' returns a structured snapshot suitable for telemetry.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const format = (params as { format?: "text" | "json" }).format ?? "text";
			return runOp(ctx, (e) => {
				if (format === "json") {
					const snapshot = e.report("json");
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(snapshot, null, 2),
							},
						],
						details: { snapshot, state: e.state },
					};
				}
				const text = e.report();
				return {
					content: [{ type: "text", text }],
					details: { state: e.state },
				};
			});
		},
	});

	// --- Goal tools -----------------------------------------------------------

	pi.registerTool({
		name: "prides_goal_set",
		label: "PRIDES Set Goal",
		description:
			"Set the project goal with objective and success criteria for drift tracking.",
		promptSnippet: "Set a PRIDES project goal",
		promptGuidelines: [
			"Use prides_goal_set immediately after scaffold to define what done looks like.",
			"Write checkable success criteria, not vague goals.",
		],
		parameters: Type.Object({
			objective: Type.String({
				description: "One-sentence definition of done",
			}),
			successCriteria: Type.Array(Type.String(), {
				description: "Checkable success criteria",
			}),
			nonGoals: Type.Optional(
				Type.Array(Type.String(), {
					description: "Explicitly out-of-scope items",
				}),
			),
			constraints: Type.Optional(
				Type.Array(Type.String(), {
					description: "Constraints (e.g. no new dependencies)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.setGoal({
					objective: params.objective,
					successCriteria: params.successCriteria,
					nonGoals: params.nonGoals,
					constraints: params.constraints,
				});
				return {
					content: [{ type: "text", text: r.message }],
					details: { state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_goal_check",
		label: "PRIDES Check Goal Drift",
		description:
			"Run a drift check to verify the agent is still aligned with the original goal.",
		promptSnippet: "Run a PRIDES goal drift check",
		promptGuidelines: [
			"Use prides_goal_check when scope decisions are made or during heartbeat.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const check = await e.checkGoalDrift();
				if (!("aligned" in check)) {
					return {
						content: [
							{
								type: "text",
								text: `Goal check failed: ${(check as { message: string }).message}`,
							},
						],
						details: { state: e.state },
					};
				}
				const severity = driftSeverity(check.driftScore);
				const note =
					severity === "warn"
						? `\n⚠ Goal drift warning (${check.driftScore}): ${check.reasoning}`
						: severity === "stop"
							? `\n⛔ Auto-stop: severe goal drift (${check.driftScore})`
							: "";
				return {
					content: [
						{
							type: "text",
							text: `Goal drift: aligned=${check.aligned} score=${check.driftScore}${note}`,
						},
					],
					details: { check, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_goal_verify",
		label: "PRIDES Verify Goal",
		description:
			"Verify all success criteria are met before finishing or advancing to critical phases.",
		promptSnippet: "Verify PRIDES goal success criteria",
		promptGuidelines: [
			"Use prides_goal_verify before advancing from I→D or entering S.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const check = await e.verifyGoal();
				if (!("aligned" in check)) {
					return {
						content: [
							{
								type: "text",
								text: `Goal verify failed: ${(check as { message: string }).message}`,
							},
						],
						details: { state: e.state },
					};
				}
				const unmet = check.unmetCriteria?.length
					? `\nUnmet: ${check.unmetCriteria.join("; ")}`
					: "";
				return {
					content: [
						{
							type: "text",
							text: `Goal verify: aligned=${check.aligned} score=${check.driftScore}${unmet}`,
						},
					],
					details: { check, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_drift_ack",
		label: "PRIDES Acknowledge Drift",
		description:
			"Acknowledge the current goal-drift warning so phase advancement is permitted. Records an explicit human/agent acknowledgment of the drift score.",
		promptSnippet: "Acknowledge the current goal-drift warning",
		promptGuidelines: [
			"Use prides_drift_ack after reading the drift warning and confirming the agent should continue despite the score.",
			"The ack covers the score provided (defaults to the most recent goal-check score).",
			"A new warning raised after this ack will block again.",
		],
		parameters: Type.Object({
			score: Type.Optional(
				Type.Number({
					description:
						"Drift score to acknowledge (defaults to latest goal-check score).",
				}),
			),
			warningId: Type.Optional(
				Type.String({ description: "Specific warning id to acknowledge." }),
			),
			reason: Type.Optional(
				Type.String({
					description: "Optional reason recorded in the audit trail.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.acknowledgeDrift(
					(params as { score?: number }).score,
					(params as { warningId?: string }).warningId,
				);
				const reason = (params as { reason?: string }).reason;
				if (reason) {
					e.state = {
						...e.state,
						driftAck: {
							...(e.state.driftAck as {
								at: number;
								score: number;
								warningId?: string;
							}),
						},
					};
				}
				return {
					content: [{ type: "text", text: r.message }],
					details: { ok: r.ok, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_task_add",
		label: "PRIDES Add Task",
		description: "Add a tracked task to the current phase.",
		promptSnippet: "Add a PRIDES task",
		promptGuidelines: ["Use prides_task_add to track work items per phase."],
		parameters: Type.Object({
			description: Type.String({ description: "Task description" }),
			phase: Type.Optional(StringEnum(PHASE_ORDER)),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const t = e.addTask(
					params.description,
					(params.phase as Phase) ?? e.state.phase,
				);
				let text = `Task #${t.id} added: ${t.description}`;
				if (e.state.goal && shouldRunDriftCheck(e.state, now())) {
					const check = await e.checkGoalDrift();
					if ("aligned" in check && !check.aligned) {
						text += `\n⚠ Goal drift detected (${check.driftScore}): ${check.reasoning}`;
					}
				}
				return {
					content: [{ type: "text", text }],
					details: { task: t, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_task_done",
		label: "PRIDES Complete Task",
		description: "Mark a tracked task as completed by id.",
		promptSnippet: "Mark a PRIDES task complete",
		promptGuidelines: [
			"Use prides_task_done with a task id to record completion.",
		],
		parameters: Type.Object({ id: Type.Number({ description: "Task id" }) }),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.doneTask(params.id);
				return {
					content: [{ type: "text", text: r.message }],
					details: { ok: r.ok, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_task_list",
		label: "PRIDES List Tasks",
		description: "List all tracked tasks with their status and owning phase.",
		promptSnippet: "List PRIDES tasks",
		promptGuidelines: ["Use prides_task_list to review outstanding work."],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const tasks = e.listTasks();
				const text = tasks.length
					? tasks
							.map(
								(t) =>
									`[${t.status === "completed" ? "x" : " "}] #${t.id} (${t.phase}) ${t.description}`,
							)
							.join("\n")
					: "No tasks";
				return {
					content: [{ type: "text", text }],
					details: { tasks, state: e.state },
				};
			});
		},
	});

	// --- Warning Tools -------------------------------------------------------

	pi.registerTool({
		name: "prides_warn",
		label: "PRIDES Add Warning",
		description:
			"Add a warning that may block git operations and phase advancement.",
		promptSnippet: "Add a PRIDES warning",
		promptGuidelines: [
			"Use prides_warn to flag issues that should block commits/pushes until resolved.",
		],
		parameters: Type.Object({
			severity: StringEnum(["info", "warn", "error"]),
			category: Type.String({
				description:
					"Warning category, e.g. 'gate-failure', 'taxonomy', 'security'",
			}),
			message: Type.String({ description: "Warning message" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const w = e.addWarning(
					params.severity as "info" | "warn" | "error",
					params.category,
					params.message,
				);
				return {
					content: [
						{
							type: "text",
							text: `Warning added [${w.severity}]: ${w.category} — ${w.message}`,
						},
					],
					details: { warning: w, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_warn_resolve",
		label: "PRIDES Resolve Warning",
		description: "Resolve (dismiss) an active warning by id.",
		promptSnippet: "Resolve a PRIDES warning",
		promptGuidelines: [
			"Use prides_warn_resolve after fixing the issue that caused a warning.",
		],
		parameters: Type.Object({
			id: Type.String({ description: "Warning id to resolve" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const r = e.resolveWarning(params.id);
				return {
					content: [{ type: "text", text: r.message }],
					details: { ok: r.ok, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_warn_list",
		label: "PRIDES List Warnings",
		description: "List all active (unresolved) warnings.",
		promptSnippet: "List active PRIDES warnings",
		promptGuidelines: [
			"Use prides_warn_list to check for issues blocking git operations.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const warnings = e.getActiveWarnings();
				const text = warnings.length
					? warnings
							.map(
								(w) => `[${w.severity}] ${w.id}: ${w.category} — ${w.message}`,
							)
							.join("\n")
					: "No active warnings";
				return {
					content: [{ type: "text", text }],
					details: { warnings, state: e.state },
				};
			});
		},
	});

	// --- Git Workflow Tools ---------------------------------------------------

	pi.registerTool({
		name: "prides_git_status",
		label: "PRIDES Git Status",
		description:
			"Show current Git workflow status (branch, category, step, PR, rebase).",
		promptSnippet: "Show PRIDES git branch and workflow step status",
		promptGuidelines: [
			"Use prides_git_status to inspect current branch taxonomy and workflow step before PR or merge operations.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const text = e.getGitWorkflowStatus();
				return {
					content: [{ type: "text", text }],
					details: { git: e.state.git, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_git_branch",
		label: "PRIDES Git Branch",
		description:
			"Create/track a Git branch according to taxonomy (main, feature/*, hotfix/*, bug/*, release/*, chore/*).",
		promptSnippet: "Track or switch Git branch with taxonomy enforcement",
		promptGuidelines: [
			"Use prides_git_branch when starting work on a feature, bugfix, or hotfix branch.",
		],
		parameters: Type.Object({
			branchName: Type.String({
				description:
					"Branch name (e.g. feature/add-login, hotfix/auth-leak, bug/null-pointer)",
			}),
			category: Type.Optional(
				StringEnum(["main", "feature", "hotfix", "bug", "release", "chore"]),
			),
			targetBranch: Type.Optional(
				Type.String({ description: "Base target branch (default: main)" }),
			),
			executeGit: Type.Optional(
				Type.Boolean({
					description:
						"Execute actual shell command 'git checkout -b <branch>'",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const res = e.startGitBranch(
					params.branchName,
					params.category as BranchType | undefined,
					params.targetBranch,
				);
				let execOutput = "";
				if (res.ok && params.executeGit) {
					const r = await runner(
						`git checkout -b ${params.branchName}`,
						ctx.cwd,
					);
					execOutput =
						r.code === 0
							? " (git checkout succeeded)"
							: ` (git checkout failed: ${r.stderr})`;
				}
				return {
					content: [{ type: "text", text: res.message + execOutput }],
					details: { ok: res.ok, git: e.state.git, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_git_rebase",
		label: "PRIDES Git Rebase",
		description:
			"Record/execute Git rebase of current feature branch onto target branch (main).",
		promptSnippet: "Rebase feature branch onto main target branch",
		promptGuidelines: [
			"Use prides_git_rebase before opening a PR to maintain linear history.",
		],
		parameters: Type.Object({
			executeGit: Type.Optional(
				Type.Boolean({
					description:
						"Execute actual shell command 'git rebase <targetBranch>'",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const target = e.state.git?.targetBranch ?? "main";
				const res = e.recordGitRebase();
				let execOutput = "";
				if (res.ok && params.executeGit) {
					const r = await runner(`git rebase ${target}`, ctx.cwd);
					execOutput =
						r.code === 0
							? " (git rebase succeeded)"
							: ` (git rebase failed: ${r.stderr})`;
				}
				return {
					content: [{ type: "text", text: res.message + execOutput }],
					details: { ok: res.ok, git: e.state.git, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_git_pr",
		label: "PRIDES Git PR",
		description:
			"Record or create Pull Request details for current feature branch.",
		promptSnippet: "Record PR creation for current branch",
		promptGuidelines: [
			"Use prides_git_pr after rebasing to record Pull Request creation.",
		],
		parameters: Type.Object({
			prNumber: Type.Optional(
				Type.Number({ description: "Pull request number" }),
			),
			prUrl: Type.Optional(Type.String({ description: "Pull request URL" })),
			executeGit: Type.Optional(
				Type.Boolean({
					description: "Execute 'gh pr create' or 'git push' shell command",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const res = e.recordGitPR(params.prNumber, params.prUrl);
				let execOutput = "";
				if (res.ok && params.executeGit) {
					const r = await runner(
						"gh pr create --fill || git push -u origin HEAD",
						ctx.cwd,
					);
					execOutput =
						r.code === 0
							? " (push/PR command succeeded)"
							: ` (push/PR command exited ${r.code})`;
				}
				return {
					content: [{ type: "text", text: res.message + execOutput }],
					details: { ok: res.ok, git: e.state.git, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_git_review",
		label: "PRIDES Git Review",
		description:
			"Record Pull Request code review verdict (approved, changes_requested, pending).",
		promptSnippet: "Record PR code review verdict",
		promptGuidelines: [
			"Use prides_git_review during Review phase to record peer or automated PR review status.",
		],
		parameters: Type.Object({
			status: StringEnum(["approved", "changes_requested", "pending"]),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const res = e.recordGitReview(
					params.status as "approved" | "changes_requested" | "pending",
				);
				return {
					content: [{ type: "text", text: res.message }],
					details: { ok: res.ok, git: e.state.git, state: e.state },
				};
			});
		},
	});

	pi.registerTool({
		name: "prides_git_merge",
		label: "PRIDES Git Merge",
		description:
			"Merge current feature branch into target branch (main) upon successful review.",
		promptSnippet: "Record or execute PR merge to base main branch",
		promptGuidelines: [
			"Use prides_git_merge after PR review approval to complete the branch workflow.",
		],
		parameters: Type.Object({
			executeGit: Type.Optional(
				Type.Boolean({
					description: "Execute 'gh pr merge' or local git merge command",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, async (e) => {
				const target = e.state.git?.targetBranch ?? "main";
				const current = e.state.git?.currentBranch;
				const res = e.recordGitMerge();
				let execOutput = "";
				if (res.ok && params.executeGit && current) {
					const r = await runner(
						`gh pr merge --merge || (git checkout ${target} && git merge ${current})`,
						ctx.cwd,
					);
					execOutput =
						r.code === 0
							? " (merge command succeeded)"
							: ` (merge command exited ${r.code})`;
				}
				return {
					content: [{ type: "text", text: res.message + execOutput }],
					details: { ok: res.ok, git: e.state.git, state: e.state },
				};
			});
		},
	});

	// --- Command: /prides <subcommand> --------------------------------------

	pi.registerCommand("prides", {
		description:
			"PRIDES controls: status, next, gates, gate <name>, hb <intent>, stop <reason>, resume, report, scaffold, goal set|check|verify, task add|done|list",
		getArgumentCompletions: (prefix) => {
			const parts = prefix.split(/\s+/);
			const firstWord = parts[0] ?? "";

			// Level 1: subcommands
			const subs = [
				"status",
				"next",
				"gates",
				"gate",
				"approve",
				"hb",
				"stop",
				"resume",
				"report",
				"scaffold",
				"goal",
				"task",
				"git",
			];

			// Level 2: nested completions
			const gitSubs = ["status", "branch", "rebase", "pr", "review", "merge"];
			const taskSubs = ["add", "done"];
			const goalSubs = ["set", "check", "verify"];

			// If we're still typing the first word, filter subcommands
			if (parts.length <= 1) {
				const filtered = subs.filter((s) => s.startsWith(firstWord));
				return filtered.length
					? filtered.map((s) => ({ value: s, label: s }))
					: null;
			}

			// Level 2 completions for git
			if (firstWord === "git") {
				const gitWord = parts[1] ?? "";
				const filtered = gitSubs.filter((s) => s.startsWith(gitWord));
				return filtered.length
					? filtered.map((s) => ({ value: `${firstWord} ${s}`, label: s }))
					: null;
			}

			// Level 2 completions for task
			if (firstWord === "task") {
				const taskWord = parts[1] ?? "";
				const filtered = taskSubs.filter((s) => s.startsWith(taskWord));
				return filtered.length
					? filtered.map((s) => ({ value: `${firstWord} ${s}`, label: s }))
					: null;
			}

			// Level 2 completions for goal
			if (firstWord === "goal") {
				const goalWord = parts[1] ?? "";
				const filtered = goalSubs.filter((s) => s.startsWith(goalWord));
				return filtered.length
					? filtered.map((s) => ({ value: `${firstWord} ${s}`, label: s }))
					: null;
			}

			return null;
		},
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "status";
			const rest = parts.slice(1).join(" ");

			await ensureEngine(ctx);

			const show = (title: string, text: string) => {
				if (ctx.hasUI) {
					ctx.ui.select(title, text.split("\n")).catch(() => {});
				} else {
					ctx.ui.notify(text.split("\n")[0] ?? title, "info");
				}
			};

			switch (sub) {
				case "status": {
					const r = await runOp(ctx, (e) => e.serialize());
					show("PRIDES Status", JSON.stringify(r, null, 2));
					break;
				}
				case "git": {
					const verb = parts[1] ?? "status";
					const gitRest = parts.slice(2).join(" ");
					if (verb === "branch") {
						if (!gitRest) {
							ctx.ui.notify(
								"Usage: /prides git branch <branchName> [targetBranch]",
								"warning",
							);
							break;
						}
						const [branchName, targetBranch] = gitRest.split(/\s+/);
						const r = await runOp(ctx, (e) =>
							e.startGitBranch(branchName, undefined, targetBranch),
						);
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else if (verb === "rebase") {
						const r = await runOp(ctx, (e) => e.recordGitRebase());
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else if (verb === "pr") {
						const num = Number.parseInt(gitRest, 10);
						const prNum = Number.isNaN(num) ? undefined : num;
						const r = await runOp(ctx, (e) =>
							e.recordGitPR(prNum, !prNum ? gitRest : undefined),
						);
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else if (verb === "review") {
						if (
							gitRest !== "approved" &&
							gitRest !== "changes_requested" &&
							gitRest !== "pending"
						) {
							ctx.ui.notify(
								"Usage: /prides git review <approved|changes_requested|pending>",
								"warning",
							);
							break;
						}
						const r = await runOp(ctx, (e) =>
							e.recordGitReview(
								gitRest as "approved" | "changes_requested" | "pending",
							),
						);
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else if (verb === "merge") {
						const r = await runOp(ctx, (e) => e.recordGitMerge());
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else {
						const statusStr = await runOp(ctx, (e) => e.getGitWorkflowStatus());
						show("PRIDES Git Workflow Status", statusStr);
					}
					break;
				}
				case "next": {
					const force = rest.includes("force") || rest.includes("--force");
					const r = await runOp(ctx, (e) => e.advance(force));
					ctx.ui.notify(r.message, r.ok ? "info" : "error");
					break;
				}
				case "gates": {
					const results = await runOp(ctx, (e) => e.runGates());
					show(
						"PRIDES Gates",
						results
							.map((g) => `${g.name}: ${g.status} — ${g.message}`)
							.join("\n"),
					);
					break;
				}
				case "gate": {
					if (!rest) {
						ctx.ui.notify("Usage: /prides gate <name>", "warning");
						break;
					}
					const r = await runOp(ctx, (e) => e.runGate(rest));
					ctx.ui.notify(
						`${rest}: ${r.result.status} — ${r.result.message}`,
						r.result.status === "fail" ? "error" : "info",
					);
					break;
				}
				case "approve": {
					if (!rest) {
						ctx.ui.notify("Usage: /prides approve <gate>", "warning");
						break;
					}
					const r = await runOp(ctx, (e) => e.approveGate(rest));
					ctx.ui.notify(
						r.ok ? r.message : `Cannot sign off ${rest}: ${r.message}`,
						r.ok ? "info" : "error",
					);
					break;
				}
				case "hb": {
					const intent = rest || "working";
					const pulse = await runOp(ctx, (e) => e.heartbeat(intent));
					ctx.ui.notify(`Heartbeat: ${pulse.status}`, "info");
					break;
				}
				case "stop": {
					await runOp(ctx, (e) => {
						e.emergencyStop(rest || "manual stop");
						return null;
					});
					ctx.ui.notify(`EMERGENCY STOP: ${rest || "manual stop"}`, "error");
					break;
				}
				case "resume": {
					await runOp(ctx, (e) => {
						e.emergencyResume();
						return null;
					});
					ctx.ui.notify("Emergency stop cleared", "info");
					break;
				}
				case "report": {
					const text = await runOp(ctx, (e) => e.report());
					show("PRIDES Report", text);
					break;
				}
				case "goal": {
					const verb = parts[1];
					if (verb === "set") {
						if (!rest) {
							ctx.ui.notify(
								"Usage: /prides goal set <objective> [criteria...]",
								"warning",
							);
							break;
						}
						const sp = rest.split(/\s+/);
						const objective = sp[0];
						const successCriteria =
							sp.slice(1).length > 0 ? sp.slice(1) : ["TBD"];
						const r = await runOp(ctx, (e) =>
							e.setGoal({ objective, successCriteria }),
						);
						ctx.ui.notify(r.message, "info");
					} else if (verb === "check") {
						const check = await runOp(ctx, (e) => e.checkGoalDrift());
						if ("aligned" in check) {
							const severity = driftSeverity(check.driftScore);
							const note =
								severity === "warn"
									? ` — drift warning (${check.driftScore})`
									: severity === "stop"
										? " — auto-stop"
										: "";
							ctx.ui.notify(
								`Goal drift: aligned=${check.aligned} score=${check.driftScore}${note}`,
								check.aligned ? "info" : "error",
							);
						} else {
							ctx.ui.notify(
								`Goal check failed: ${(check as { message: string }).message}`,
								"error",
							);
						}
					} else if (verb === "verify") {
						const check = await runOp(ctx, (e) => e.verifyGoal());
						if ("aligned" in check) {
							ctx.ui.notify(
								`Goal verify: aligned=${check.aligned} score=${check.driftScore}`,
								check.aligned ? "info" : "error",
							);
						} else {
							ctx.ui.notify(
								`Goal verify failed: ${(check as { message: string }).message}`,
								"error",
							);
						}
					} else {
						ctx.ui.notify("Usage: /prides goal set|check|verify", "warning");
					}
					break;
				}
				case "scaffold": {
					const sp = rest.split(/\s+/);
					const name = sp[0];
					const purpose = sp.slice(1).join(" ") || name || "New PRIDES project";
					if (!name) {
						ctx.ui.notify(
							"Usage: /prides scaffold <name> [purpose...]",
							"warning",
						);
						break;
					}
					const intent: ProjectIntent = { name, purpose };
					await runOp(ctx, async (e) => {
						e.setIntent(intent);
						const files = e.planScaffold(intent);
						const created: string[] = [];
						for (const f of files) {
							const full = resolve(ctx.cwd, f.path);
							await mkdir(dirname(full), { recursive: true });
							await writeFile(full, f.content, "utf8");
							created.push(f.path);
						}

						// Auto-detect git branch and initialize workflow tracking
						const branch = await detectGitBranch(ctx.cwd);
						if (branch) {
							const gitResult = e.initGitFromBranch(branch);
							ctx.ui.notify(
								`Scaffolded ${created.length} files · branch: ${branch} — ${gitResult.message}`,
								gitResult.conforms ? "info" : "warning",
							);
						} else {
							ctx.ui.notify(
								`Scaffolded ${created.length} files · git: not detected`,
								"info",
							);
						}
						return created;
					});
					break;
				}
				case "task": {
					const verb = parts[1];
					const taskRest = parts.slice(2).join(" ");
					if (verb === "add") {
						const t = await runOp(ctx, (e) => e.addTask(taskRest));
						ctx.ui.notify(`Task #${t.id} added`, "info");
					} else if (verb === "done") {
						const id = Number.parseInt(taskRest, 10);
						if (Number.isNaN(id)) {
							ctx.ui.notify("Usage: /prides task done <id>", "warning");
							break;
						}
						const r = await runOp(ctx, (e) => e.doneTask(id));
						ctx.ui.notify(r.message, r.ok ? "info" : "error");
					} else {
						const tasks = await runOp(ctx, (e) => e.listTasks());
						show(
							"PRIDES Tasks",
							tasks
								.map(
									(t) =>
										`[${t.status === "completed" ? "x" : " "}] #${t.id} (${t.phase}) ${t.description}`,
								)
								.join("\n") || "No tasks",
						);
					}
					break;
				}
				default:
					ctx.ui.notify(
						`Unknown subcommand: ${sub}. Try /prides status`,
						"warning",
					);
			}
		},
	});
}
