/**
 * pi-prides — Quality gate definitions + evaluation
 *
 * Pure logic. Command execution and globbing are injected so the evaluator
 * can be unit-tested without spawning a shell or touching the filesystem.
 */
import type {
	Clock,
	GateDef,
	GateResult,
	GateRunner,
	Globber,
	Judge,
	Phase,
} from "./types.js";

/**
 * Default gate set, grouped by phase. Commands are suggestions; projects
 * override them via `.prides/gates.config.json` (loaded by the host).
 */
export const DEFAULT_GATES: GateDef[] = [
	{
		name: "review",
		phase: "R",
		description: "Code review & inspection sign-off",
		type: "manual",
	},
	{
		name: "test-unit",
		phase: "I",
		description: "Unit test suite passes",
		type: "command",
		command: "npm run test:unit",
	},
	{
		name: "test-e2e",
		phase: "I",
		description: "End-to-end test suite passes",
		type: "command",
		command: "npm run test:e2e",
	},
	{
		name: "linter",
		phase: "I",
		description: "Linter is clean",
		type: "command",
		command: "npm run lint",
	},
	{
		name: "dependencies",
		phase: "I",
		description: "Dependency audit is clean",
		type: "command",
		command: "npm audit --omit=dev",
	},
	{
		name: "deploy-check",
		phase: "D",
		description: "Deployment pre-flight checks pass",
		type: "command",
		command: "npm run deploy:check",
	},
	{
		name: "performance",
		phase: "E",
		description: "Performance budget within limits",
		type: "command",
		command: "npm run perf",
	},
	{
		name: "accessibility",
		phase: "E",
		description: "Accessibility checks pass",
		type: "manual",
	},
	{
		name: "security",
		phase: "S",
		description: "Security audit passes",
		type: "command",
		command: "npm run audit:security",
	},
];

export function getGate(name: string, defs: GateDef[]): GateDef | undefined {
	return defs.find((d) => d.name === name);
}

export function getGatesForPhase(phase: Phase, defs: GateDef[]): GateDef[] {
	return defs.filter((d) => d.phase === phase);
}

/** Evaluate a single gate definition against the live project. */
export async function evaluateGate(
	def: GateDef,
	runner: GateRunner,
	globber: Globber,
	now: Clock,
	cwd: string,
	judge: Judge,
): Promise<GateResult> {
	const ranAt = now();

	if (def.type === "manual") {
		return {
			name: def.name,
			phase: def.phase,
			status: "pending",
			message: "Manual gate — requires human sign-off",
			ranAt,
		};
	}

	if (def.type === "eval") {
		const prompt = def.prompt ?? def.name;
		try {
			const v = await judge(prompt, { cwd });
			return {
				name: def.name,
				phase: def.phase,
				status: v.status,
				score: v.score,
				message: v.message || "eval judge returned no message",
				ranAt,
			};
		} catch (e) {
			return {
				name: def.name,
				phase: def.phase,
				status: "warn",
				message: `eval judge failed: ${String(e).slice(0, 200)}`,
				ranAt,
			};
		}
	}

	if (def.type === "artifact") {
		const files = def.artifactGlob ? await globber(def.artifactGlob, cwd) : [];
		const ok = files.length > 0;
		return {
			name: def.name,
			phase: def.phase,
			status: ok ? "pass" : "fail",
			message: ok
				? `Found ${files.length} artifact(s) for ${def.artifactGlob}`
				: `No artifacts match ${def.artifactGlob}`,
			ranAt,
		};
	}

	// command
	if (!def.command) {
		return {
			name: def.name,
			phase: def.phase,
			status: "warn",
			message: "No command configured for gate",
			ranAt,
		};
	}
	const res = await runner(def.command, cwd);
	const ok = res.code === 0;
	return {
		name: def.name,
		phase: def.phase,
		status: ok ? "pass" : "fail",
		message: ok
			? `${def.command} exited 0`
			: `${def.command} exited ${res.code}`,
		ranAt,
	};
}

/** Evaluate every gate defined for a phase, in declared order. */
export async function evaluateGatesForPhase(
	phase: Phase,
	defs: GateDef[],
	runner: GateRunner,
	globber: Globber,
	now: Clock,
	cwd: string,
	judge: Judge,
): Promise<GateResult[]> {
	const results: GateResult[] = [];
	for (const def of getGatesForPhase(phase, defs)) {
		results.push(await evaluateGate(def, runner, globber, now, cwd, judge));
	}
	return results;
}

export function allPass(results: GateResult[]): boolean {
	return results.every((r) => r.status === "pass");
}

export function summarizeGates(results: GateResult[]): string {
	if (results.length === 0) return "no gates defined for phase";
	const pass = results.filter((r) => r.status === "pass").length;
	const fail = results.filter((r) => r.status === "fail").length;
	const pending = results.filter((r) => r.status === "pending").length;
	return `${pass} pass / ${fail} fail / ${pending} pending`;
}
