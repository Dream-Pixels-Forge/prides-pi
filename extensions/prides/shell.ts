/**
 * pi-prides — Shell-safety helpers (pure)
 *
 * pi executes shell commands through a real shell (bash on POSIX, Git Bash on
 * Windows via `createLocalBashOperations`), so ANY value interpolated into a
 * command string is a potential command-injection vector (see
 * CWE-78: OS Command Injection). These helpers exist so untrusted values
 * (branch names, eval rubrics, artifact paths) can be safely embedded.
 *
 * Defense in depth:
 *  1. `shQuote` — POSIX single-quote escaping for values that must be
 *     interpolated into a command line. Safe for bash/sh/Git Bash, which is
 *     pi's shell on every platform.
 *  2. Prefer argv over interpolation whenever possible, and validate with
 *     allow-lists (see `gitWorkflow.ts` for branch-name validation).
 */

/** POSIX single-quote escape. Everything inside single quotes is literal in
 *  bash/sh — the only escape needed is the quote itself (`'` → `'\''`). */
export function shQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Reject anything that is not a safe "word" character for shell arguments.
 *  Also rejects empty path segments (`..`, `feature/..`), leading `.` (relative
 *  paths) and leading `-` (option-injection — `-flag` would be parsed as a
 *  CLI option when interpolated into a command). */
export function isSafeWord(value: string): boolean {
	if (
		!value ||
		value.startsWith("-") ||
		value.startsWith(".") ||
		value.includes("..")
	) {
		return false;
	}
	return /^[A-Za-z0-9._/-]+$/.test(value);
}

/** Maximum length for values we are willing to embed in a command line. */
export const MAX_SHELL_ARG_LENGTH = 1024;

/** Quote a value for the shell, refusing values that cannot be quoted safely. */
export function shellArg(value: string): string {
	if (value.length > MAX_SHELL_ARG_LENGTH) {
		throw new Error(`shell argument too long (${value.length} chars)`);
	}
	return shQuote(value);
}
