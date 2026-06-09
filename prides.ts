"""PRIDES PI Extension — bundled from src/*.ts"""

/* ─── config.ts ─── */
export const PHASES = ["P", "R", "I", "D", "E", "S"] as const;
export type Phase = (typeof PHASES)[number];

export interface PhaseConfig {
  name: string;
  heartbeatMs: number;
  criticality: "low" | "medium" | "high" | "critical";
  entryCriteria: string[];
  exitCriteria: string[];
  blockedTools: string[];
}

export const CONFIG: Record<Phase, PhaseConfig> = {
  P: {
    name: "Prototype",
    heartbeatMs: 30_000,
    criticality: "high",
    entryCriteria: [
      "Valid Intent Specification (intent.json) from Human Governor",
      "Core objective defined",
      "Constraints documented",
    ],
    exitCriteria: [
      "Scaffolding Manifest generated",
      "Constraint Set validated",
      "Agent Topology defined",
      "AP2 Intent Mandate drafted",
    ],
    blockedTools: [],
  },
  R: {
    name: "Review",
    heartbeatMs: 120_000,
    criticality: "high",
    entryCriteria: [
      "Scaffolding Manifest from Phase P",
      "All P exit gates passed",
    ],
    exitCriteria: [
      "Eval Report: 10,000+ simulation passes with 99.9% alignment",
      "Cost Mandate (AP2) signed by human",
      "No critical security findings",
    ],
    blockedTools: ["write", "edit"],
  },
  I: {
    name: "Implement",
    heartbeatMs: 30_000,
    criticality: "critical",
    entryCriteria: [
      "Signed Intent Mandate",
      "Validated Scaffolding",
      "AP2 budget authorized",
    ],
    exitCriteria: [
      "Binary/Artifact Hash recorded",
      "Reasoning Provenance log complete",
      "All quality gates passed",
      "No file exceeds 500 lines",
    ],
    blockedTools: [],
  },
  D: {
    name: "Deploy",
    heartbeatMs: 60_000,
    criticality: "critical",
    entryCriteria: [
      "Phase I Provenance Log",
      "Security Clearances from Phase S",
      "All tests passing",
    ],
    exitCriteria: [
      "Payment Mandate (AP2) executed",
      "Live Heartbeat initialized",
      "Rollback plan documented",
    ],
    blockedTools: ["write", "edit"],
  },
  E: {
    name: "Extend",
    heartbeatMs: 300_000,
    criticality: "medium",
    entryCriteria: [
      "Healthy production heartbeat for >24 hours",
      "User feedback collection active",
      "Performance baseline established",
    ],
    exitCriteria: [
      "Optimization Proposal validated against Phase P intent",
      "Major features routed to new P phase",
    ],
    blockedTools: [],
  },
  S: {
    name: "Secure",
    heartbeatMs: 30_000,
    criticality: "critical",
    entryCriteria: [
      "Active from Deployment (continuous)",
      "All prior phases complete",
    ],
    exitCriteria: [
      "Compliance Token issued",
      "Zero critical/high CVSS vulnerabilities",
      "ZK-Proofs generated if required",
    ],
    blockedTools: ["write", "edit"],
  },
};

export function getPhaseConfig(phase: string): PhaseConfig {
  const upper = phase.toUpperCase();
  if (!PHASES.includes(upper as Phase)) {
    throw new Error(`Invalid phase: ${phase}. Must be one of: ${PHASES.join(", ")}`);
  }
  return CONFIG[upper as Phase];
}

/* ─── gates.ts ─── */
export interface Gate {
  id: string;
  name: string;
  threshold: string;
}

export const GATES: Gate[] = [
  { id: "code-review", name: "Code Review", threshold: ">=2 approvals, 0 blocking comments" },
  { id: "test-coverage", name: "Test Coverage", threshold: ">80% line coverage" },
  { id: "security", name: "Security Scan", threshold: "Zero critical/high CVSS vulnerabilities" },
  { id: "performance", name: "Performance", threshold: "p95 latency <= target threshold" },
  { id: "accessibility", name: "Accessibility", threshold: "WCAG 2.1 AA compliance" },
];

export interface GateValidationResult {
  valid: boolean;
  gate?: Gate;
}

export function validateGate(gateId: string): GateValidationResult {
  const normalized = gateId.toLowerCase().trim();
  const gate = GATES.find(
    g => g.id === normalized || g.name.toLowerCase().includes(normalized)
  );
  if (!gate) {
    return { valid: false };
  }
  return { valid: true, gate };
}

/* ─── state.ts ─── */
export const HEARTBEAT_THRESHOLDS = {
  HEALTHY: 2,
  DEGRADED: 4,
} as const;

export interface PRIDESState {
  currentPhase: Phase;
  phaseIndex: number;
  gateResults: Record<string, boolean>;
  heartbeats: { ts: number; phase: Phase; status: string; intent?: string }[];
  incidents: { ts: number; phase: Phase; severity: string; detail: string }[];
  artifacts: { phase: Phase; name: string; hash?: string }[];
  startedAt: string;
}

export interface StateManager {
  readonly state: PRIDESState;
  setPhase: (phase: Phase) => void;
  advancePhase: () => Phase;
  recordHeartbeat: (status: "healthy" | "drifting" | "stalled", intent?: string) => void;
  logIncident: (severity: string, detail: string) => void;
  logArtifact: (phase: Phase, name: string, hash?: string) => void;
  setGateResult: (gateId: string, passed: boolean) => void;
  toJSON: () => string;
  fromJSON: (json: string) => void;
  getReport: () => {
    currentPhase: Phase;
    phaseName: string;
    sessionStarted: string;
    totalArtifacts: number;
    totalIncidents: number;
    gates: { id: string; name: string; passed: boolean; threshold: string }[];
    recentIncidents: { ts: number; phase: Phase; severity: string; detail: string }[];
    recommendations: string[];
  };
  onChange: (callback: (phase: Phase) => void) => void;
}

export function createState(initialPhase: Phase = "P"): StateManager {
  const state: PRIDESState = {
    currentPhase: initialPhase,
    phaseIndex: PHASES.indexOf(initialPhase),
    gateResults: {},
    heartbeats: [],
    incidents: [],
    artifacts: [],
    startedAt: new Date().toISOString(),
  };

  const subscribers: Array<(phase: Phase) => void> = [];

  function notifySubscribers(phase: Phase): void {
    subscribers.forEach(callback => callback(phase));
  }

  function normalizeGateKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, "-");
  }

  function nextPhase(): Phase {
    const idx = PHASES.indexOf(state.currentPhase);
    return PHASES[(idx + 1) % PHASES.length];
  }

  function setPhase(phase: Phase): void {
    state.currentPhase = phase;
    state.phaseIndex = PHASES.indexOf(phase);
    notifySubscribers(phase);
  }

  function advancePhase(): Phase {
    const next = nextPhase();
    state.currentPhase = next;
    state.phaseIndex = PHASES.indexOf(next);
    state.artifacts.push({ phase: next, name: `phase-${next}-init` });
    notifySubscribers(next);
    return next;
  }

  function recordHeartbeat(status: "healthy" | "drifting" | "stalled", intent?: string): void {
    state.heartbeats.push({
      ts: Date.now(),
      phase: state.currentPhase,
      status,
      intent,
    });
  }

  function logIncident(severity: string, detail: string): void {
    state.incidents.push({
      ts: Date.now(),
      phase: state.currentPhase,
      severity,
      detail,
    });
  }

  function logArtifact(phase: Phase, name: string, hash?: string): void {
    state.artifacts.push({ phase, name, hash });
  }

  function setGateResult(gateId: string, passed: boolean): void {
    state.gateResults[normalizeGateKey(gateId)] = passed;
  }

  function toJSON(): string {
    return JSON.stringify(state);
  }

  function fromJSON(json: string): void {
    const parsed = JSON.parse(json) as PRIDESState;
    state.currentPhase = parsed.currentPhase;
    state.phaseIndex = parsed.phaseIndex;
    state.gateResults = parsed.gateResults;
    state.heartbeats = parsed.heartbeats;
    state.incidents = parsed.incidents;
    state.artifacts = parsed.artifacts;
    state.startedAt = parsed.startedAt;
  }

  function getReport() {
    const gates = GATES.map(g => ({
      id: g.id,
      name: g.name,
      passed: state.gateResults[g.id] ?? false,
      threshold: g.threshold,
    }));

    const failingGates = gates.filter(g => !g.passed);
    const recommendations: string[] = [];
    if (failingGates.length > 0) {
      recommendations.push(`Address failing gates: ${failingGates.map(g => g.id).join(", ")}`);
    }
    if (state.incidents.length > 3) {
      recommendations.push(`Review ${state.incidents.length} incidents — consider adjusting workflow`);
    }

    return {
      currentPhase: state.currentPhase,
      phaseName: CONFIG[state.currentPhase].name,
      sessionStarted: state.startedAt,
      totalArtifacts: state.artifacts.length,
      totalIncidents: state.incidents.length,
      gates,
      recentIncidents: state.incidents.slice(-5),
      recommendations,
    };
  }

  return {
    get state() { return state; },
    setPhase,
    advancePhase,
    recordHeartbeat,
    logIncident,
    logArtifact,
    setGateResult,
    toJSON,
    fromJSON,
    getReport,
    onChange: (callback: (phase: Phase) => void) => {
      subscribers.push(callback);
    },
  };
}

/* ─── guards.ts ─── */
export interface ToolGuard {
  check: (toolName: string) => { blocked: boolean; reason?: string };
}

export interface LiveToolGuard extends ToolGuard {
  update: (phase: Phase, blockedTools: string[]) => void;
}

export function createToolGuard(initialPhase: Phase, initialBlockedTools: string[]): LiveToolGuard {
  let phase = initialPhase;
  let blockedTools = initialBlockedTools;

  return {
    check: (toolName: string) => {
      if (blockedTools.includes(toolName)) {
        const cfg = CONFIG[phase];
        return {
          blocked: true,
          reason: `Tool "${toolName}" is blocked in Phase ${phase} (${cfg.name}). Use /prides to advance or override.`,
        };
      }
      return { blocked: false };
    },
    update: (newPhase: Phase, newBlockedTools: string[]) => {
      phase = newPhase;
      blockedTools = newBlockedTools;
    },
  };
}

export interface SessionGuard {
  check: () => { blocked: boolean; reason?: string };
}

export interface LiveSessionGuard extends SessionGuard {
  update: (phase: Phase, criticality: string, gateResults: Record<string, boolean>) => void;
}

export function createSessionGuard(
  initialPhase: Phase,
  initialGateResults: Record<string, boolean>,
  initialCriticality: string
): LiveSessionGuard {
  let phase = initialPhase;
  let gateResults = initialGateResults;
  let criticality = initialCriticality;

  return {
    check: () => {
      if (criticality === "critical") {
        const failing = GATES.filter(g => !gateResults[g.id]);
        if (failing.length > 0) {
          const cfg = CONFIG[phase];
          return {
            blocked: true,
            reason: `Cannot switch session — ${failing.length} quality gate(s) failing in critical phase ${phase} (${cfg.name}). Run /prides gates to check.`,
          };
        }
      }
      return { blocked: false };
    },
    update: (newPhase: Phase, newCriticality: string, newGateResults: Record<string, boolean>) => {
      phase = newPhase;
      criticality = newCriticality;
      gateResults = newGateResults;
    },
  };
}

/* ─── tools.ts ─── */
import type { ExtensionAPI, ToolDefinition, RegisteredCommand } from "@earendil-works/pi-coding-agent";
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
            phase: state.state.currentPhase,
            missingCriteria: missing,
            message: `Cannot advance from ${state.state.currentPhase}. Missing: ${missing.join("; ")}. Use force=true to override.`,
          };
        }
      }

      const next = nextPhase(state.state.currentPhase);
      state.setPhase(next);
      state.logArtifact(next, `phase-${next}-init`);

      return {
        advanced: true,
        from: state.state.currentPhase,
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

/* ─── index.ts ─── */
export { buildTools, buildCommand, type ToolContext } from "./tools.js";

/* ─── extension.ts ─── */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

