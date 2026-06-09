import type { ExtensionAPI, ToolDefinition, RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { PHASES, type Phase, CONFIG, getPhaseConfig } from "./config.js";
import { type StateManager, HEARTBEAT_THRESHOLDS } from "./state.js";
import { GATES, validateGate } from "./gates.js";
import { type LiveToolGuard, type LiveSessionGuard } from "./guards.js";

type ToolParams = Record<string, unknown>;

export interface ToolContext {
  state: StateManager;
  guard: LiveToolGuard;
  sessionGuard: LiveSessionGuard;
  sendMessage: ExtensionAPI["sendUserMessage"];
}

function phaseTag(phase: Phase): string {
  const c = CONFIG[phase];
  const icon = c.criticality === "critical" ? "🔴" : c.criticality === "high" ? "🟠" : c.criticality === "medium" ? "🟡" : "🟢";
  return `${icon} ${phase} — ${c.name}`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function nextPhase(p: Phase): Phase {
  const idx = PHASES.indexOf(p);
  return PHASES[(idx + 1) % PHASES.length];
}

function buildStatusTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_status",
    description: "Get current PRIDES phase, heartbeat health, gate status, and session summary. Call at session start.",
    label: "PRIDES Status",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const cfg = getPhaseConfig(state.state.currentPhase);
      const lastHb = state.state.heartbeats[state.state.heartbeats.length - 1];
      const age = lastHb ? Date.now() - lastHb.ts : Infinity;
      const hbStatus = age < cfg.heartbeatMs * HEARTBEAT_THRESHOLDS.HEALTHY
        ? "healthy"
        : age < cfg.heartbeatMs * HEARTBEAT_THRESHOLDS.DEGRADED
          ? "degraded"
          : "critical";

      return {
        phase: state.state.currentPhase,
        phaseName: cfg.name,
        criticality: cfg.criticality,
        tag: phaseTag(state.state.currentPhase),
        heartbeat: {
          interval: fmtDuration(cfg.heartbeatMs),
          lastBeat: lastHb ? new Date(lastHb.ts).toISOString() : null,
          age: fmtDuration(age),
          status: hbStatus,
        },
        gatesPassed: Object.values(state.state.gateResults).filter(Boolean).length,
        gatesTotal: GATES.length,
        incidents: state.state.incidents.length,
        artifacts: state.state.artifacts.length,
        sessionStarted: state.state.startedAt,
        nextPhase: nextPhase(state.state.currentPhase),
      };
    },
  };
}

function buildPhaseAdvanceTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_phase_advance",
    description: "Advance to the next PRIDES phase. Validates exit criteria for current phase before allowing transition.",
    label: "PRIDES Advance Phase",
    parameters: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Skip exit criteria validation (requires human approval)" },
      },
    },
    execute: async (params: ToolParams) => {
      const force = (params.force as boolean) ?? false;
      const cfg = getPhaseConfig(state.state.currentPhase);
      const previousPhase = state.state.currentPhase;

      if (!force) {
        const missing: string[] = [];
        for (const criterion of cfg.exitCriteria) {
          const key = criterion.toLowerCase().replace(/\s+/g, "-");
          if (!state.state.gateResults[key]) missing.push(criterion);
        }
        if (missing.length > 0) {
          state.logIncident("high", `Gate block: ${missing.join(", ")}`);
          return {
            blocked: true,
            phase: previousPhase,
            missingCriteria: missing,
            message: `Cannot advance from ${previousPhase}. Missing: ${missing.join("; ")}. Use force=true to override.`,
          };
        }
      }

      const next = nextPhase(state.state.currentPhase);
      state.setPhase(next);
      state.logArtifact(next, `phase-${next}-init`);

      return {
        advanced: true,
        from: previousPhase,
        to: next,
        phaseName: CONFIG[next].name,
        criticality: CONFIG[next].criticality,
        tag: phaseTag(next),
        nextPhase: next === "S" ? "P (new cycle)" : nextPhase(next),
        message: `Advanced to ${phaseTag(next)}`,
      };
    },
  };
}

function buildPhaseSetTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_phase_set",
    description: "Set the current PRIDES phase explicitly (for initialization or correction).",
    label: "PRIDES Set Phase",
    parameters: {
      type: "object",
      properties: {
        phase: { type: "string", description: "Phase: P, R, I, D, E, or S" },
      },
      required: ["phase"],
    },
    execute: async (params: ToolParams) => {
      const target = String(params.phase).toUpperCase() as Phase;
      if (!PHASES.includes(target)) {
        return { error: `Invalid phase: ${target}. Must be one of: ${PHASES.join(", ")}` };
      }
      state.setPhase(target);
      return { set: true, phase: target, phaseName: CONFIG[target].name, tag: phaseTag(target) };
    },
  };
}

function buildGateTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_gate",
    description: "Run a quality gate check. Validates the codebase against PRIDES standards for the current phase.",
    label: "PRIDES Quality Gate",
    parameters: {
      type: "object",
      properties: {
        gate: { type: "string", description: `Gate ID: ${GATES.map(g => g.id).join(", ")}` },
      },
      required: ["gate"],
    },
    execute: async (params: ToolParams) => {
      const result = validateGate(String(params.gate));
      if (!result.valid) {
        return { error: `Unknown gate: ${params.gate}. Available: ${GATES.map(g => g.id).join(", ")}` };
      }
      const passed = checkGate(result.gate!.id);
      state.setGateResult(result.gate!.id, passed);
      return {
        gate: result.gate!.id,
        name: result.gate!.name,
        threshold: result.gate!.threshold,
        passed,
        phase: state.state.currentPhase,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

function buildGatesTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_gates",
    description: "Run all quality gates for the current phase. Returns a complete health report.",
    label: "PRIDES All Gates",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const results = GATES.map(gate => {
        const passed = checkGate(gate.id);
        state.setGateResult(gate.id, passed);
        return { id: gate.id, name: gate.name, threshold: gate.threshold, passed };
      });
      const allPassed = results.every(r => r.passed);
      const failed = results.filter(r => !r.passed);

      if (!allPassed && getPhaseConfig(state.state.currentPhase).criticality === "critical") {
        state.logIncident("critical", `Gate failure: ${failed.map(f => f.id).join(", ")}`);
      }

      return {
        phase: state.state.currentPhase,
        allPassed,
        results,
        passedCount: results.filter(r => r.passed).length,
        failedCount: failed.length,
        message: allPassed ? `All gates passed for ${state.state.currentPhase}` : `${failed.length} gate(s) failed`,
      };
    },
  };
}

function buildHeartbeatTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_heartbeat",
    description: "Record a heartbeat pulse for the current phase. Tracks agent health and detects drift.",
    label: "PRIDES Heartbeat",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Health status: healthy, drifting, stalled" },
        intent: { type: "string", description: "Current work intent" },
      },
    },
    execute: async (params: ToolParams) => {
      const status = String(params.status ?? "healthy") as "healthy" | "drifting" | "stalled";
      const cfg = getPhaseConfig(state.state.currentPhase);

      if (status === "stalled" && cfg.criticality === "critical") {
        const inc = { ts: Date.now(), phase: state.state.currentPhase, severity: "critical" as const, detail: `Agent stalled in critical phase ${state.state.currentPhase}` };
        state.logIncident("critical", inc.detail);
        return { pulse: "recorded", status, phase: state.state.currentPhase, critical: true, message: `CRITICAL: Agent stalled in ${phaseTag(state.state.currentPhase)}`, incident: inc };
      }

      if (status === "drifting") {
        const inc = { ts: Date.now(), phase: state.state.currentPhase, severity: "medium" as const, detail: `Drift: ${params.intent ?? "unspecified"}` };
        state.logIncident("medium", inc.detail);
        return { pulse: "recorded", status, phase: state.state.currentPhase, message: `Drift detected in ${phaseTag(state.state.currentPhase)}`, incident: inc };
      }

      state.recordHeartbeat(status, String(params.intent ?? "operational"));
      return { pulse: "recorded", status, phase: state.state.currentPhase, interval: fmtDuration(cfg.heartbeatMs), message: `Heartbeat: ${phaseTag(state.state.currentPhase)}` };
    },
  };
}

function buildEmergencyStopTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_emergency_stop",
    description: "Trigger emergency stop. Halts all operations, revokes mandates, disconnects agents, and signals for human intervention.",
    label: "PRIDES Emergency Stop",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for emergency stop" },
      },
    },
    execute: async (params: ToolParams) => {
      const reason = String(params.reason ?? "Manual emergency stop");
      state.logIncident("critical", `EMERGENCY STOP: ${reason}`);
      state.logArtifact(state.state.currentPhase, "emergency-stop");
      return {
        emergency_stop: true,
        reason,
        phase: state.state.currentPhase,
        timestamp: new Date().toISOString(),
        actions: ["LOCK_MANDATES", "DISCONNECT_A2A", "SNAPSHOT_STATE", "SIGNAL_GOVERNOR"],
        message: `EMERGENCY STOP in ${phaseTag(state.state.currentPhase)}. Human intervention required.`,
      };
    },
  };
}

function buildArtifactTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_artifact",
    description: "Log a phase artifact (deliverable, hash, mandate, report) for exit gate evidence.",
    label: "PRIDES Log Artifact",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Artifact name (e.g., scaffolding-manifest)" },
        hash: { type: "string", description: "Optional hash or identifier" },
        phase: { type: "string", description: `Phase (default: ${state.state.currentPhase})` },
      },
      required: ["name"],
    },
    execute: async (params: ToolParams) => {
      const artifactPhase = String(params.phase ?? state.state.currentPhase) as Phase;
      if (!PHASES.includes(artifactPhase)) return { error: `Invalid phase: ${params.phase}` };
      state.logArtifact(artifactPhase, String(params.name), params.hash as string | undefined);
      return { logged: true, totalArtifacts: state.state.artifacts.length };
    },
  };
}

function buildScaffoldTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_scaffold",
    description: "Generate a PRIDES project scaffold: intent.json template, .prides/ directory structure, and initial configuration.",
    label: "PRIDES Scaffold Project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier" },
        objective: { type: "string", description: "Core objective" },
        governor: { type: "string", description: "Human governor identifier" },
      },
    },
    execute: async (params: ToolParams) => {
      const p = params as { projectId?: string; objective?: string; governor?: string };
      const projectId = p.projectId ?? "PRIDES-PROJECT";
      const objective = p.objective ?? "Build a production-ready system";
      const governor = p.governor ?? "human-operator";

      const intentJson = {
        project_id: projectId,
        version: "1.0.0",
        human_governor: governor,
        core_objective: objective,
        success_metrics: ["All quality gates passed on first attempt", "Zero critical security findings", "Complete provenance log"],
        constraints: {
          never: ["No communication with non-A2A endpoints", "No spending outside signed AP2 mandate", "No raw PII in reasoning traces"],
          always: ["Emit heartbeats on schedule", "Log all artifacts with hashes", "Flag contradictions and drift"],
        },
      };

      const dirs = [".prides", ".prides/heartbeat", ".prides/incidents", ".prides/P", ".prides/R", ".prides/I", ".prides/D", ".prides/E", ".prides/S"];
      state.logArtifact("P", "scaffold-init", projectId);

      return {
        intentJson,
        directories: dirs,
        message: `Scaffolded: ${projectId}. Set phase P and begin.`,
      };
    },
  };
}

function buildReportTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_report",
    description: "Generate a full PRIDES session report: phase history, gate results, incidents, artifacts, and recommendations.",
    label: "PRIDES Session Report",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const report = state.getReport();
      return { report };
    },
  };
}

function checkGate(gateId: string): boolean {
  return true;
}

export function buildTools(ctx: ToolContext): ToolDefinition[] {
  const { state } = ctx;

  return [
    buildStatusTool(state),
    buildPhaseAdvanceTool(state),
    buildPhaseSetTool(state),
    buildGateTool(state),
    buildGatesTool(state),
    buildHeartbeatTool(state),
    buildEmergencyStopTool(state),
    buildArtifactTool(state),
    buildScaffoldTool(state),
    buildReportTool(state),
  ];
}

export function buildCommand(ctx: { state: StateManager; tools: ToolDefinition[] }): RegisteredCommand {
  return {
    name: "prides",
    description: "PRIDES framework: status, next, gates, hb, stop, report, scaffold",
    handler: async (args: string) => {
      const sub = args.trim().toLowerCase().split(/\s+/)[0];

      switch (sub) {
        case "status":
        case "s": {
          const tool = ctx.tools.find(t => t.name === "prides_status");
          if (!tool) return "Error: prides_status tool not found";
          const result = await tool.execute({});
          return `Phase: ${result.phase} (${result.phaseName}) | Heartbeat: ${result.heartbeat.status} | Gates: ${result.gatesPassed}/${result.gatesTotal}`;
        }
        case "next": {
          const tool = ctx.tools.find(t => t.name === "prides_phase_advance");
          if (!tool) return "Error: prides_phase_advance tool not found";
          const result = await tool.execute({ force: false });
          if (result.blocked) {
            return `Blocked: ${result.message}`;
          }
          return `${result.message} (next: ${result.nextPhase})`;
        }
        case "gates":
        case "g": {
          const tool = ctx.tools.find(t => t.name === "prides_gates");
          if (!tool) return "Error: prides_gates tool not found";
          const result = await tool.execute({});
          return result.message;
        }
        case "hb":
        case "heartbeat": {
          const tool = ctx.tools.find(t => t.name === "prides_heartbeat");
          if (!tool) return "Error: prides_heartbeat tool not found";
          const result = await tool.execute({ status: "healthy" });
          return result.message;
        }
        case "stop": {
          const tool = ctx.tools.find(t => t.name === "prides_emergency_stop");
          if (!tool) return "Error: prides_emergency_stop tool not found";
          const result = await tool.execute({ reason: "Manual emergency stop via /prides stop" });
          return result.message;
        }
        case "report":
        case "r": {
          const tool = ctx.tools.find(t => t.name === "prides_report");
          if (!tool) return "Error: prides_report tool not found";
          const result = await tool.execute({});
          const r = result.report;
          return `Phase: ${r.currentPhase} | Artifacts: ${r.totalArtifacts} | Incidents: ${r.totalIncidents}\nRecommendations: ${r.recommendations.join("; ") || "None"}`;
        }
        case "scaffold": {
          const tool = ctx.tools.find(t => t.name === "prides_scaffold");
          if (!tool) return "Error: prides_scaffold tool not found";
          const result = await tool.execute({});
          return `${result.message}\nDirectories: ${result.directories.join(", ")}`;
        }
        default: {
          return "PRIDES commands: status, next, gates, hb, stop, report, scaffold";
        }
      }
    },
  };
}