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
import { isStalled } from "./heartbeat.js";
import { canAdvance, isCritical, PHASE_CONFIG, PHASE_ORDER } from "./phases.js";
import { shQuote } from "./shell.js";
import { createInitialState } from "./state.js";
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
	const s = engine.state;
	const open = s.tasks.filter((t) => t.status !== "completed").length;
	const pass = Object.values(s.gates).filter((g) => g.status === "pass").length;
	const total = Object.keys(s.gates).length;
	const lines = [
		`PRIDES ${s.phase} · ${PHASE_CONFIG[s.phase].name}${s.emergencyStop ? "  ⛔ STOP" : ""}`,
		`tasks: ${open} open · gates: ${pass}/${total} pass`,
		s.heartbeat
			? `hb: ${isStalled(s, now) ? "STALLED" : s.heartbeat.status}`
			: "hb: —",
	];
	ctx.ui.setWidget("prides", lines);
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
		ctx.ui.notify(
			`PRIDES active — phase ${phase} (${PHASE_CONFIG[phase].name})`,
			"info",
		);
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

	pi.on("resources_discover", async () => ({
		skillPaths: [resolve(HERE, "../skills")],
		promptPaths: [resolve(HERE, "../prompts")],
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

	pi.on("tool_call", async (event, ctx) => {
		const name = event.toolName;
		if (!name || name.startsWith("prides_")) return { block: false }; // never block our own tools
		await ensureEngine(ctx);
		const s = engine?.state;
		if (!s) return { block: false };

		const guardOn = pi.getFlag("prides-guard") !== false;
		const lax = pi.getFlag("prides-lax") === true;
		if (!guardOn || lax) return { block: false };

		if (s.emergencyStop && MUTATING.has(name)) {
			return {
				block: true,
				reason: "PRIDES emergency stop active — no mutations allowed",
			};
		}
		if (GUARD_PHASES.has(s.phase) && (name === "write" || name === "edit")) {
			return {
				block: true,
				reason: `PRIDES guard: file writes are blocked during the ${s.phase} (${PHASE_CONFIG[s.phase].name}) phase. Advance to Implement with /prides next, or disable with --prides-lax.`,
			};
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
			"Show current PRIDES phase, heartbeat, gate results, open tasks, and emergency-stop state.",
		promptSnippet: "Show current PRIDES phase, gates, heartbeat, and tasks",
		promptGuidelines: [
			"Use prides_status to report the current SDLC phase and gate health before proposing phase changes.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const s = e.state;
				const cfg = PHASE_CONFIG[s.phase];
				const text = [
					`PRIDES phase: ${s.phase} (${cfg.name}) [${cfg.criticality}]`,
					`Emergency stop: ${s.emergencyStop ? "ACTIVE" : "off"}`,
					`Tasks: ${s.tasks.filter((t) => t.status !== "completed").length} open / ${s.tasks.length} total`,
					`Heartbeat: ${s.heartbeat ? `${s.heartbeat.status}${isStalled(s, now) ? " (STALLED)" : ""}` : "none"}`,
					`Gates: ${Object.values(s.gates).filter((g) => g.status === "pass").length}/${Object.keys(s.gates).length} passing`,
				].join("\n");
				return { content: [{ type: "text", text }], details: { state: s } };
			});
		},
		renderCall() {
			return new Text("prides_status", 0, 0);
		},
		renderResult(result, _options, theme) {
			const s = (result.details as { state?: PRIDESState } | undefined)?.state;
			if (!s) {
				return new Text(
					result.content[0]?.type === "text" ? result.content[0].text : "",
					0,
					0,
				);
			}
			const cfg = PHASE_CONFIG[s.phase];
			let t =
				theme.fg("accent", `PRIDES ${s.phase}`) +
				theme.fg("muted", ` · ${cfg.name}`);
			if (s.emergencyStop) t += theme.fg("error", "  ⛔ STOP");
			t +=
				"\n" +
				theme.fg(
					"dim",
					`tasks ${s.tasks.filter((x) => x.status !== "completed").length} open · gates ${Object.values(s.gates).filter((g) => g.status === "pass").length}/${Object.keys(s.gates).length} pass`,
				);
			return new Text(t, 0, 0);
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
		],
		parameters: Type.Object({
			intent: Type.String({
				description: "What the agent is currently working on",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const pulse = e.heartbeat(params.intent);
				return {
					content: [
						{ type: "text", text: `Heartbeat recorded: ${pulse.status}` },
					],
					details: { pulse, state: e.state },
				};
			});
		},
		renderResult(result, _options, theme) {
			const d = result.details as { pulse?: { status: string } } | undefined;
			const status = d?.pulse?.status ?? "?";
			const color =
				status === "HEALTHY"
					? "success"
					: status === "STALLED"
						? "error"
						: "warning";
			return new Text(theme.fg(color, `♥ ${status}`), 0, 0);
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
				return {
					content: [
						{
							type: "text",
							text: `Scaffolded ${created.length} files (intent: ${intent.name})`,
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
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return runOp(ctx, (e) => {
				const text = e.report();
				return {
					content: [{ type: "text", text }],
					details: { state: e.state },
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
			return runOp(ctx, (e) => {
				const t = e.addTask(
					params.description,
					(params.phase as Phase) ?? e.state.phase,
				);
				return {
					content: [
						{ type: "text", text: `Task #${t.id} added: ${t.description}` },
					],
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
			"PRIDES controls: status, next, gates, gate <name>, hb <intent>, stop <reason>, resume, report, scaffold, task add|done|list",
		getArgumentCompletions: (prefix) => {
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
				"task",
				"git",
			];
			const filtered = subs.filter((s) => s.startsWith(prefix));
			return filtered.length
				? filtered.map((s) => ({ value: s, label: s }))
				: null;
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
					const r = await runOp(ctx, async (e) => {
						e.setIntent(intent);
						const files = e.planScaffold(intent);
						const created: string[] = [];
						for (const f of files) {
							const full = resolve(ctx.cwd, f.path);
							await mkdir(dirname(full), { recursive: true });
							await writeFile(full, f.content, "utf8");
							created.push(f.path);
						}
						return created;
					});
					ctx.ui.notify(`Scaffolded ${r.length} files`, "info");
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
