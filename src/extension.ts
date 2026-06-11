import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTools, buildCommand } from "./tools.js";
import { createToolGuard, createSessionGuard } from "./guards.js";
import { CONFIG } from "./config.js";
import { createState } from "./state.js";

export default function (pi: ExtensionAPI) {
  const state = createState("P");

  const guard = createToolGuard(state.state.currentPhase, CONFIG[state.state.currentPhase].blockedTools);
  const sessionGuard = createSessionGuard(
    state.state.currentPhase,
    state.state.gateResults,
    CONFIG[state.state.currentPhase].criticality
  );

  const unsubscribe = state.onChange((newPhase, gateResults) => {
    const cfg = CONFIG[newPhase];
    guard.update(newPhase, cfg.blockedTools);
    sessionGuard.update(newPhase, cfg.criticality, gateResults);
  });

  const ctx = {
    state,
    sendMessage: pi.sendUserMessage.bind(pi),
  };

  const tools = buildTools(ctx);
  for (const tool of tools) {
    pi.registerTool(tool);
  }

  const command = buildCommand({ state: ctx.state, tools });
  pi.registerCommand("prides", command);

  pi.events.on("tool_execution_start", (event) => {
    const result = guard.check(event.toolName);
    if (result.blocked) {
      return { cancel: true, reason: result.reason };
    }
  });

  pi.events.on("session_before_switch", () => {
    const result = sessionGuard.check();
    if (result.blocked) {
      return { cancel: true, reason: result.reason };
    }
    return {};
  });

  pi.events.on("session_start", () => {
    try {
      pi.sendUserMessage(`PRIDES v1.1.0 ready — Phase ${state.state.currentPhase}`, { deliverAs: "nextTurn" });
    } catch (err) {
      console.error("PRIDES: failed to send session start message", err);
    }
  });
}