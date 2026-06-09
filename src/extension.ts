import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTools, buildCommand, createToolGuard, createSessionGuard, PHASES, type Phase, CONFIG, createState } from "./index.js";

export default function (pi: ExtensionAPI) {
  const state = createState("P");

  const guard = createToolGuard(state.state.currentPhase, CONFIG[state.state.currentPhase].blockedTools);
  const sessionGuard = createSessionGuard(
    state.state.currentPhase,
    state.state.gateResults,
    CONFIG[state.state.currentPhase].criticality
  );

  state.onChange((newPhase) => {
    const cfg = CONFIG[newPhase];
    guard.update(newPhase, cfg.blockedTools);
    sessionGuard.update(newPhase, cfg.criticality, state.state.gateResults);
  });

  const ctx = {
    state,
    guard,
    sessionGuard,
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
    } catch {}
  });
}