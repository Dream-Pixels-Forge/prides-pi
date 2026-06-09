import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTools, buildCommand, createToolGuard, createSessionGuard, PHASES, type Phase } from "./src/index.js";

// ── Extension entry point ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const state = {
    currentPhase: "P" as Phase,
    phaseIndex: 0,
    gateResults: {} as Record<string, boolean>,
    heartbeats: [] as any[],
    incidents: [] as any[],
    artifacts: [] as any[],
    startedAt: new Date().toISOString(),
  };

  const guard = createToolGuard(state.currentPhase, []);
  const sessionGuard = createSessionGuard(state.currentPhase, state.gateResults, "high", []);

  const ctx = {
    state: {
      state,
      setPhase: (phase: Phase) => {
        state.currentPhase = phase;
        state.phaseIndex = PHASES.indexOf(phase);
      },
      advancePhase: () => {
        const idx = PHASES.indexOf(state.currentPhase);
        const next = PHASES[(idx + 1) % PHASES.length];
        state.currentPhase = next;
        state.phaseIndex = PHASES.indexOf(next);
        state.artifacts.push({ phase: next, name: `phase-${next}-init` });
        return next;
      },
      recordHeartbeat: (status: string, intent?: string) => {
        state.heartbeats.push({ ts: Date.now(), phase: state.currentPhase, status, intent });
      },
      logIncident: (severity: string, detail: string) => {
        state.incidents.push({ ts: Date.now(), phase: state.currentPhase, severity, detail });
      },
      logArtifact: (phase: Phase, name: string, hash?: string) => {
        state.artifacts.push({ phase, name, hash });
      },
      setGateResult: (gateId: string, passed: boolean) => {
        state.gateResults[gateId] = passed;
      },
      toJSON: () => JSON.stringify(state),
      fromJSON: (json: string) => {
        const parsed = JSON.parse(json);
        Object.assign(state, parsed);
      },
      getReport: () => ({
        currentPhase: state.currentPhase,
        phaseName: "Prototype",
        sessionStarted: state.startedAt,
        totalArtifacts: state.artifacts.length,
        totalIncidents: state.incidents.length,
        gates: [],
        recentIncidents: state.incidents.slice(-5),
        recommendations: [],
      }),
    } as any,
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
      pi.sendUserMessage(`PRIDES v1.1.0 ready — Phase ${state.currentPhase}`, { deliverAs: "nextTurn" });
    } catch {}
  });
}
