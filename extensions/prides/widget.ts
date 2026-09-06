/**
 * pi-prides — Animated widget factory
 *
 * Returns a `(tui, theme) => Component` factory suitable for
 * `ctx.ui.setWidget("prides", factory)`. The component renders the live
 * PRIDES status snapshot on every frame, so updates are immediate on
 * state changes.
 *
 * For a true frame-based spinner on the heartbeat indicator, the factory
 * captures a `Loader` instance and reuses it across renders. The Loader
 * runs its own animation loop at the configured interval.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Loader, Text } from "@earendil-works/pi-tui";
import type { IssueCounts } from "./status.js";
import { buildStatus } from "./status.js";
import type { GateDef, PRIDESState } from "./types.js";

export type StateGetter = () => PRIDESState;
export type CountsGetter = () => IssueCounts;
export type DefsGetter = () => GateDef[];
export type NowGetter = () => number;
export type ThemeColor = (color: string, text: string) => string;

export type WidgetFactory = (
	tui: TUI,
	theme: Theme,
) => Component & { dispose?: () => void };

/** Build the widget factory. The state + counts getters are called on every
 *  render frame so changes to state are reflected immediately. */
export function buildWidget(
	getState: StateGetter,
	getCounts: CountsGetter,
	getDefs: DefsGetter = () => [],
	getNow: NowGetter = Date.now,
): WidgetFactory {
	return (tui: TUI, theme: Theme) => {
		const text = new Text("", 0, 0);
		const colorFg: ThemeColor =
			typeof (theme as { fg?: unknown }).fg === "function"
				? (theme as unknown as { fg: ThemeColor }).fg
				: (_color, t) => t;

		// Loader requires a real TUI with requestRender(); degrade gracefully
		// when the host passes a partial/mock TUI (e.g. in tests).
		const supportsLoader =
			typeof (tui as { requestRender?: unknown }).requestRender === "function";
		let loader: Loader | null = null;
		if (supportsLoader) {
			loader = new Loader(
				tui,
				(c) => colorFg("dim", c),
				(c) => colorFg("accent", c),
				"…",
				{ frames: ["·", "∙", "●", "∙"], intervalMs: 250 },
			);
		}
		let loaderStarted = false;
		const ensureLoader = () => {
			if (loader && !loaderStarted) {
				loader.start();
				loaderStarted = true;
			}
		};

		const render = (width: number): string[] => {
			const status = buildStatus(getState(), getDefs(), getCounts(), getNow);
			const animatedPrefix = status.heartbeatPresent && loader ? "" : "· ";
			if (loader) {
				loader.setMessage(
					`${animatedPrefix}hb: ${status.heartbeatStatus ?? "—"}`,
				);
				ensureLoader();
			}

			const lines: string[] = [];
			// Heartbeat row (animated loader prefix + status)
			lines.push(`${animatedPrefix}hb: ${status.heartbeatStatus ?? "—"}`);
			// Phase progress + meta
			lines.push(
				`PRIDES ${status.phase} · ${status.phaseName}${status.emergencyStop ? "  ⛔ STOP" : ""}  (${status.phaseProgress})`,
			);
			lines.push(status.progressBar);
			const gateSummary =
				`tasks: ${status.tasksOpen}/${status.tasksTotal} open · gates: ${status.gatesPass}/${status.gatesTotal} pass` +
				(status.gatesFail > 0 ? ` (${status.gatesFail} fail)` : "") +
				(status.gatesPending > 0 ? ` (${status.gatesPending} pending)` : "");
			lines.push(gateSummary);
			const driftTag =
				status.driftScore === null
					? "goal: —"
					: `goal: drift ${status.driftScore.toFixed(2)} (${status.driftSeverity})`;
			lines.push(
				`issues: ${status.issuesOpen} open · PRs: ${status.prsOpen} open · ${driftTag}`,
			);
			if (status.warningsError > 0 || status.warningsWarn > 0) {
				const parts: string[] = [];
				if (status.warningsError > 0)
					parts.push(`${status.warningsError} error(s)`);
				if (status.warningsWarn > 0)
					parts.push(`${status.warningsWarn} warning(s)`);
				lines.push(`⚠ ${parts.join(" · ")} — commit/push blocked`);
			}
			if (status.gatesBlockingNames.length > 0) {
				lines.push(`blocking: ${status.gatesBlockingNames.join(", ")}`);
			}

			text.setText(lines.join("\n"));
			text.invalidate();
			return text.render(width);
		};

		const dispose = (): void => {
			if (loader && loaderStarted) loader.stop();
		};

		return { render, invalidate: () => text.invalidate(), dispose };
	};
}
