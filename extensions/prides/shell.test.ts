import { execSync } from "node:child_process";
import { platform } from "node:process";
import { describe, expect, it } from "vitest";
import {
	isSafeWord,
	MAX_SHELL_ARG_LENGTH,
	shellArg,
	shQuote,
} from "./shell.js";

// `shQuote` is POSIX single-quote escaping — it is the correct escape for
// pi's shell (bash on POSIX, Git Bash on Windows). On Windows cmd.exe
// (Node's default `shell`), the round-trip below would fail because cmd.exe
// does not honor POSIX quoting. We still want to exercise the round-trip in
// CI on Linux/macOS, so only run it on POSIX.
const POSIX = platform !== "win32";
const runSh = (command: string): string =>
	execSync(command, {
		encoding: "utf8",
		shell: POSIX ? "/bin/sh" : undefined,
	}).trimEnd();

describe("shQuote", () => {
	it("wraps plain values in single quotes", () => {
		expect(shQuote("feature/add-login")).toBe("'feature/add-login'");
	});

	it("escapes embedded single quotes", () => {
		expect(shQuote("it's")).toBe("'it'\\''s'");
	});

	it("neutralizes shell metacharacters", () => {
		// `$(...)`, backticks, `;`, `|`, `&`, `>`, `<`, newlines must be inert
		const evil = "feature/x;rm -rf /";
		const quoted = shQuote(evil);
		expect(quoted).toContain(";");
		// The result is a single quoted token: any metachar inside is literal.
		expect(quoted.startsWith("'")).toBe(true);
		expect(quoted.endsWith("'")).toBe(true);
		if (POSIX) {
			// Round-trip through a real shell: value must come back unchanged.
			expect(runSh(`printf '%s' ${quoted}`)).toBe(evil);
		}
	});

	it("round-trips backticks, $(), and pipes through a real shell", () => {
		const evil = "`id` $(whoami) a|b c&d e>f g<h";
		const quoted = shQuote(evil);
		if (!POSIX) {
			// POSIX-only: cmd.exe would corrupt the round-trip.
			return;
		}
		expect(runSh(`printf '%s' ${quoted}`)).toBe(evil);
	});

	it("handles empty strings", () => {
		expect(shQuote("")).toBe("''");
		if (POSIX) expect(runSh(`printf '%s' ${shQuote("")}`)).toBe("");
	});
});

describe("isSafeWord", () => {
	it("accepts git-safe branch names", () => {
		for (const ok of [
			"main",
			"feature/add-login",
			"hotfix/1.2.3",
			"release/v2.0",
			"bug/issue-42",
			"chore/docs",
			"FEATURE/UPPER",
		]) {
			expect(isSafeWord(ok)).toBe(true);
		}
	});

	it("rejects shell metacharacters and spaces", () => {
		for (const bad of [
			"feature/x;rm -rf /",
			"feature/$(id)",
			"feature/`id`",
			"feature/a|b",
			"feature/a&b",
			"feature/a>b",
			"feature/a b",
			"feature/a'b",
			'feature/a"b',
			"feature/a\\b",
			"-flag",
			"..",
			"feature/..",
		]) {
			expect(isSafeWord(bad)).toBe(false);
		}
	});
});

describe("shellArg", () => {
	it("quotes values and rejects oversized ones", () => {
		expect(shellArg("ok")).toBe("'ok'");
		expect(() => shellArg("x".repeat(MAX_SHELL_ARG_LENGTH + 1))).toThrow(
			/too long/,
		);
	});
});
