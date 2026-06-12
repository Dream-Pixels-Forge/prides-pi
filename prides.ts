// PRIDES PI Extension — bundled from src/*.ts

/* ─── config.ts ─── */
export const PHASES = ["P", "R", "I", "D", "E", "S"] as const;
export type Phase = (typeof PHASES)[number];
export function nextPhase(p: Phase): Phase {
  if (!PHASES.includes(p)) {
    throw new Error(`Invalid phase: ${p}. Must be one of: ${PHASES.join(", ")}`);
  }
  const idx = PHASES.indexOf(p);
  return PHASES[(idx + 1) % PHASES.length];
}

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

export interface GateContext {
  currentPhase: string;
  gateResults: Record<string, boolean>;
  artifacts: { phase: string; name: string; hash?: string }[];
  incidents: { ts: number; phase: string; severity: string; detail: string }[];
}

export interface GateResult {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export type GateEvaluator = (gateId: string, context: GateContext) => GateResult;

export const GATES: Gate[] = [
  { id: "code-review", name: "Code Review", threshold: ">=2 approvals, 0 blocking comments" },
  { id: "test-coverage", name: "Test Coverage", threshold: ">80% line coverage" },
  { id: "security", name: "Security Scan", threshold: "Zero critical/high CVSS vulnerabilities" },
  { id: "performance", name: "Performance", threshold: "p95 latency <= target threshold" },
  { id: "accessibility", name: "Accessibility", threshold: "WCAG 2.1 AA compliance" },
];

export type GateValidationResult =
  | { valid: true; gate: Gate }
  | { valid: false; gate?: undefined };

export function validateGate(gateId: string): GateValidationResult {
  const normalized = gateId.toLowerCase().trim();
  const gate = GATES.find(
    g => g.id === normalized || (normalized.length >= 3 && g.name.toLowerCase().includes(normalized))
  );
  if (!gate) {
    return { valid: false };
  }
  return { valid: true, gate };
}

export function createDefaultGateEvaluator(): GateEvaluator {
  return (gateId, context) => {
    switch (gateId) {
      case "code-review":
        return {
          passed: context.artifacts.some(a => a.name.includes("code-review")),
          reason: context.artifacts.some(a => a.name.includes("code-review"))
            ? undefined
            : "No code-review artifact found",
        };
      case "test-coverage":
        return {
          passed: context.artifacts.some(a => a.name.includes("test-coverage")),
          reason: context.artifacts.some(a => a.name.includes("test-coverage"))
            ? undefined
            : "No test-coverage artifact found",
        };
      case "security":
        return {
          passed: !context.incidents.some(i => i.severity === "critical" && i.detail.includes("security")),
          reason: context.incidents.some(i => i.severity === "critical" && i.detail.includes("security"))
            ? "Critical security incident found"
            : undefined,
        };
      case "performance":
        return {
          passed: context.artifacts.some(a => a.name.includes("performance")),
          reason: context.artifacts.some(a => a.name.includes("performance"))
            ? undefined
            : "No performance benchmark artifact found",
        };
      case "accessibility":
        return {
          passed: context.artifacts.some(a => a.name.includes("accessibility")),
          reason: context.artifacts.some(a => a.name.includes("accessibility"))
            ? undefined
            : "No accessibility audit artifact found",
        };
      default:
        return { passed: true };
    }
  };
}

/* ─── state.ts ─── */
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export const INCIDENT_THRESHOLD = 3;

const MAX_HISTORY = 100;
const RECENT_INCIDENTS = 5;

export const HEARTBEAT_THRESHOLDS = {
  HEALTHY: 2,
  DEGRADED: 4,
} as const;

export interface TaskPlan {
  phase: Phase;
  tasks: { id: string; description: string; done: boolean; completedAt?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface PRIDSEvent {
  id: string;
  type: "phase_changed" | "gate_result" | "heartbeat" | "incident" | "artifact" | "task_updated";
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface PRIDESState {
  currentPhase: Phase;
  phaseIndex: number;
  gateResults: Record<string, boolean>;
  heartbeats: { ts: number; phase: Phase; status: "healthy" | "drifting" | "stalled"; intent?: string }[];
  incidents: { ts: number; phase: Phase; severity: IncidentSeverity; detail: string }[];
  artifacts: { phase: Phase; name: string; hash?: string }[];
  startedAt: string;
  taskPlan: TaskPlan | null;
  events: PRIDSEvent[];
  emergencyStopped: boolean;
}

export interface Report {
  currentPhase: Phase;
  phaseName: string;
  sessionStarted: string;
  totalArtifacts: number;
  totalIncidents: number;
  gates: { id: string; name: string; passed: boolean; threshold: string }[];
  recentIncidents: { ts: number; phase: Phase; severity: IncidentSeverity; detail: string }[];
  recommendations: string[];
}

export interface StateManager {
  readonly state: PRIDESState;
  setPhase: (phase: Phase) => void;
  advancePhase: () => Phase;
  recordHeartbeat: (status: "healthy" | "drifting" | "stalled", intent?: string) => void;
  logIncident: (severity: IncidentSeverity, detail: string) => void;
  logArtifact: (phase: Phase, name: string, hash?: string) => void;
  setGateResult: (gateId: string, passed: boolean) => boolean;
  evaluateGate: (gateId: string) => { passed: boolean; reason?: string };
  setGateEvaluator: (evaluator: GateEvaluator) => void;
  getTaskPlan: () => TaskPlan | null;
  setTaskPlan: (plan: TaskPlan) => void;
  addTask: (description: string) => string;
  completeTask: (taskId: string) => boolean;
  getPhaseProgress: () => { total: number; completed: number; percentage: number };
  appendEvent: (type: PRIDSEvent["type"], payload: Record<string, unknown>) => PRIDSEvent;
  getEvents: (filter?: { type?: string; since?: string }) => PRIDSEvent[];
  setEmergencyStop: (stopped: boolean) => void;
  isEmergencyStopped: () => boolean;
  toJSON: () => string;
  fromJSON: (json: string) => void;
  getReport: () => Report;
  onChange: (callback: (phase: Phase, gateResults: Record<string, boolean>) => void) => (() => void);
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
    taskPlan: null,
    events: [],
    emergencyStopped: false,
  };

  let gateEvaluator: GateEvaluator = createDefaultGateEvaluator();
  const subscribers: Array<(phase: Phase, gateResults: Record<string, boolean>) => void> = [];
  let eventCounter = 0;

  function notifySubscribers(phase: Phase): void {
    subscribers.forEach(callback => callback(phase, state.gateResults));
  }

  function normalizeGateKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, "-");
  }

  function setPhase(phase: Phase): void {
    if (!PHASES.includes(phase)) {
      throw new Error(`Invalid phase: ${phase}`);
    }
    const prev = state.currentPhase;
    state.currentPhase = phase;
    state.phaseIndex = PHASES.indexOf(phase);
    appendEvent("phase_changed", { from: prev, to: phase });
    notifySubscribers(phase, state.gateResults);
  }

  function advancePhase(): Phase {
    const next = nextPhase(state.currentPhase);
    setPhase(next);
    state.gateResults = {};
    state.artifacts.push({ phase: next, name: `phase-${next}-init` });
    return next;
  }

  function recordHeartbeat(status: "healthy" | "drifting" | "stalled", intent?: string): void {
    state.heartbeats.push({
      ts: Date.now(),
      phase: state.currentPhase,
      status,
      intent,
    });
    if (state.heartbeats.length > MAX_HISTORY) state.heartbeats.shift();
  }

  function logIncident(severity: IncidentSeverity, detail: string): void {
    state.incidents.push({
      ts: Date.now(),
      phase: state.currentPhase,
      severity,
      detail,
    });
    if (state.incidents.length > MAX_HISTORY) state.incidents.shift();
  }

  function logArtifact(phase: Phase, name: string, hash?: string): void {
    state.artifacts.push({ phase, name, hash });
    if (state.artifacts.length > MAX_HISTORY) state.artifacts.shift();
  }

  function setGateResult(gateId: string, passed: boolean): boolean {
    const normalized = normalizeGateKey(gateId);
    const valid = GATES.some(g => g.id === normalized);
    if (!valid) {
      console.warn(`Unknown gate ID: ${gateId}`);
      return false;
    }
    state.gateResults[normalized] = passed;
    appendEvent("gate_result", { gateId: normalized, passed });
    return true;
  }

  function evaluateGate(gateId: string): { passed: boolean; reason?: string } {
    const context: GateContext = {
      currentPhase: state.currentPhase,
      gateResults: state.gateResults,
      artifacts: state.artifacts,
      incidents: state.incidents,
    };
    return gateEvaluator(gateId, context);
  }

  function setGateEvaluator(evaluator: GateEvaluator): void {
    gateEvaluator = evaluator;
  }

  function getTaskPlan(): TaskPlan | null {
    return state.taskPlan;
  }

  function setTaskPlan(plan: TaskPlan): void {
    state.taskPlan = plan;
    appendEvent("task_updated", { plan });
  }

  function addTask(description: string): string {
    const id = `task-${Date.now()}-${++eventCounter}`;
    const now = new Date().toISOString();
    if (!state.taskPlan) {
      state.taskPlan = { phase: state.currentPhase, tasks: [], createdAt: now, updatedAt: now };
    }
    state.taskPlan.tasks.push({ id, description, done: false });
    state.taskPlan.updatedAt = now;
    appendEvent("task_updated", { action: "add", taskId: id, description });
    return id;
  }

  function completeTask(taskId: string): boolean {
    if (!state.taskPlan) return false;
    const task = state.taskPlan.tasks.find(t => t.id === taskId);
    if (!task || task.done) return false;
    task.done = true;
    task.completedAt = new Date().toISOString();
    state.taskPlan.updatedAt = new Date().toISOString();
    appendEvent("task_updated", { action: "complete", taskId });
    return true;
  }

  function getPhaseProgress(): { total: number; completed: number; percentage: number } {
    if (!state.taskPlan || state.taskPlan.tasks.length === 0) {
      return { total: 0, completed: 0, percentage: 0 };
    }
    const total = state.taskPlan.tasks.length;
    const completed = state.taskPlan.tasks.filter(t => t.done).length;
    return { total, completed, percentage: Math.round((completed / total) * 100) };
  }

  function appendEvent(type: PRIDSEvent["type"], payload: Record<string, unknown>): PRIDSEvent {
    const event: PRIDSEvent = {
      id: `evt-${Date.now()}-${++eventCounter}`,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    state.events.push(event);
    if (state.events.length > MAX_HISTORY) state.events.shift();
    return event;
  }

  function getEvents(filter?: { type?: string; since?: string }): PRIDSEvent[] {
    let events = state.events;
    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }
    if (filter?.since) {
      const sinceTime = new Date(filter.since).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }
    return events;
  }

  function setEmergencyStop(stopped: boolean): void {
    state.emergencyStopped = stopped;
    if (stopped) {
      appendEvent("incident", { type: "emergency_stop", detail: "Emergency stop activated" });
    }
  }

  function isEmergencyStopped(): boolean {
    return state.emergencyStopped;
  }

  function toJSON(): string {
    return JSON.stringify(state);
  }

  function validateHeartbeat(val: unknown): val is PRIDESState["heartbeats"][number] {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    return typeof obj.ts === "number"
      && typeof obj.phase === "string" && PHASES.includes(obj.phase as Phase)
      && (obj.status === "healthy" || obj.status === "drifting" || obj.status === "stalled");
  }

  function validateIncident(val: unknown): val is PRIDESState["incidents"][number] {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    return typeof obj.ts === "number"
      && typeof obj.phase === "string" && PHASES.includes(obj.phase as Phase)
      && (obj.severity === "low" || obj.severity === "medium" || obj.severity === "high" || obj.severity === "critical")
      && typeof obj.detail === "string";
  }

  function validateArtifact(val: unknown): val is PRIDESState["artifacts"][number] {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    return typeof obj.phase === "string" && PHASES.includes(obj.phase as Phase)
      && typeof obj.name === "string";
  }

  function fromJSON(json: string): void {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.currentPhase !== "string" || !PHASES.includes(parsed.currentPhase as Phase)) {
      throw new Error(`Invalid phase in JSON: ${String(parsed.currentPhase)}`);
    }
    state.currentPhase = parsed.currentPhase as Phase;
    state.phaseIndex = PHASES.indexOf(parsed.currentPhase as Phase);
    state.gateResults = (parsed.gateResults as Record<string, boolean>) ?? {};
    state.heartbeats = Array.isArray(parsed.heartbeats)
      ? (parsed.heartbeats as unknown[]).filter(validateHeartbeat)
      : [];
    state.incidents = Array.isArray(parsed.incidents)
      ? (parsed.incidents as unknown[]).filter(validateIncident)
      : [];
    state.artifacts = Array.isArray(parsed.artifacts)
      ? (parsed.artifacts as unknown[]).filter(validateArtifact)
      : [];
    state.startedAt = (parsed.startedAt as string) ?? new Date().toISOString();
    state.emergencyStopped = (parsed.emergencyStopped as boolean) ?? false;
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
    if (state.incidents.length > INCIDENT_THRESHOLD) {
      recommendations.push(`Review ${state.incidents.length} incidents — consider adjusting workflow`);
    }

    return {
      currentPhase: state.currentPhase,
      phaseName: CONFIG[state.currentPhase].name,
      sessionStarted: state.startedAt,
      totalArtifacts: state.artifacts.length,
      totalIncidents: state.incidents.length,
      gates,
      recentIncidents: state.incidents.slice(-RECENT_INCIDENTS),
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
    evaluateGate,
    setGateEvaluator,
    getTaskPlan,
    setTaskPlan,
    addTask,
    completeTask,
    getPhaseProgress,
    appendEvent,
    getEvents,
    setEmergencyStop,
    isEmergencyStopped,
    toJSON,
    fromJSON,
    getReport,
    onChange: (callback: (phase: Phase, gateResults: Record<string, boolean>) => void): (() => void) => {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
  };
}

/* ─── guards.ts ─── */
export interface ToolGuard {
  check: (toolName: string) => { blocked: boolean; reason?: string };
  update: (phase: Phase, blockedTools: string[]) => void;
}

export function createToolGuard(initialPhase: Phase, initialBlockedTools: string[]): ToolGuard {
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

type Criticality = PhaseConfig["criticality"];

export interface SessionGuard {
  check: () => { blocked: boolean; reason?: string };
  update: (phase: Phase, criticality: Criticality, gateResults: Record<string, boolean>) => void;
}

export function createSessionGuard(
  initialPhase: Phase,
  initialGateResults: Record<string, boolean>,
  initialCriticality: Criticality
): SessionGuard {
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
    update: (newPhase: Phase, newCriticality: Criticality, newGateResults: Record<string, boolean>) => {
      phase = newPhase;
      criticality = newCriticality;
      gateResults = newGateResults;
    },
  };
}

/* ─── tools.ts ─── */
import type { ToolDefinition, RegisteredCommand } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const TOOL_NAMES = {
  STATUS: "prides_status",
  PHASE_ADVANCE: "prides_phase_advance",
  PHASE_SET: "prides_phase_set",
  GATE: "prides_gate",
  GATES: "prides_gates",
  HEARTBEAT: "prides_heartbeat",
  EMERGENCY_STOP: "prides_emergency_stop",
  ARTIFACT: "prides_artifact",
  SCAFFOLD: "prides_scaffold",
  REPORT: "prides_report",
} as const;

export interface ToolContext {
  state: StateManager;
}

type ToolParams = Record<string, unknown>;

const CRITICALITY_ICONS: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

function phaseTag(phase: Phase): string {
  const c = CONFIG[phase];
  const icon = CRITICALITY_ICONS[c.criticality] ?? "⚪";
  return `${icon} ${phase} — ${c.name}`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}


function buildStatusTool(state: StateManager): ToolDefinition {
  return {
    name: TOOL_NAMES.STATUS,
    description: "Get current PRIDES phase, heartbeat health, gate status, and session summary. Call at session start and after every phase transition.",
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
    name: TOOL_NAMES.PHASE_ADVANCE,
    description: "Advance to the next PRIDES phase. Requires all exit criteria to be met unless force=true. Use force only with human approval.",
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
        message: `Advanced to ${phaseTag(next)}`,
      };
    },
  };
}

function buildPhaseSetTool(state: StateManager): ToolDefinition {
  return {
    name: TOOL_NAMES.PHASE_SET,
    description: "Set the current PRIDES phase explicitly. Use for session initialization or correcting phase after errors.",
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
    name: TOOL_NAMES.GATE,
    description: "Run a single quality gate check. Run after code changes to validate quality before phase advance.",
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
      const { gate } = result;
      const { passed } = state.evaluateGate(gate.id);
      state.setGateResult(gate.id, passed);
      return {
        gate: gate.id,
        name: gate.name,
        threshold: gate.threshold,
        passed,
        phase: state.state.currentPhase,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

function buildGatesTool(state: StateManager): ToolDefinition {
  return {
    name: TOOL_NAMES.GATES,
    description: "Run all quality gates for the current phase. Returns pass/fail for each gate with reasons. Required before phase advance.",
    label: "PRIDES All Gates",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const results = GATES.map(gate => {
        const { passed, reason } = state.evaluateGate(gate.id);
        state.setGateResult(gate.id, passed);
        return { id: gate.id, name: gate.name, threshold: gate.threshold, passed, reason };
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
    name: TOOL_NAMES.HEARTBEAT,
    description: "Record a heartbeat pulse. Call every heartbeatMs interval to track agent health. Reports drifting/stalled status as incidents.",
    label: "PRIDES Heartbeat",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Health status: healthy, drifting, stalled" },
        intent: { type: "string", description: "Current work intent" },
      },
    },
    execute: async (params: ToolParams) => {
      const validStatuses = ["healthy", "drifting", "stalled"] as const;
      const rawStatus = String(params.status ?? "healthy");
      const status = validStatuses.includes(rawStatus as typeof validStatuses[number])
        ? (rawStatus as typeof validStatuses[number])
        : "healthy";
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
    name: TOOL_NAMES.EMERGENCY_STOP,
    description: "Trigger emergency stop. Use only when agent behavior is unsafe or unexpected. Halts operations and signals for human intervention.",
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
      state.setEmergencyStop(true);
      return {
        emergency_stop: true,
        halted: true,
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
    name: TOOL_NAMES.ARTIFACT,
    description: "Log a phase artifact (deliverable, hash, report) for exit gate evidence. Required for gate validation.",
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
      const artifactName = String(params.name ?? "");
      if (!artifactName) {
        return { error: "Artifact name cannot be empty" };
      }
      const artifactPhase = String(params.phase ?? state.state.currentPhase) as Phase;
      if (!PHASES.includes(artifactPhase)) return { error: `Invalid phase: ${params.phase}` };
      state.logArtifact(artifactPhase, artifactName, params.hash as string | undefined);
      return { logged: true, totalArtifacts: state.state.artifacts.length };
    },
  };
}

function buildScaffoldTool(state: StateManager): ToolDefinition {
  return {
    name: TOOL_NAMES.SCAFFOLD,
    description: "Generate a PRIDES project scaffold: intent.json template, .prides/ directory structure, and initial configuration. Run once at project start.",
    label: "PRIDES Scaffold Project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier" },
        objective: { type: "string", description: "Core objective" },
        governor: { type: "string", description: "Human governor identifier" },
        projectDir: { type: "string", description: "Project directory path (default: current directory)" },
      },
    },
    execute: async (params: ToolParams) => {
      const p = params as { projectId?: string; objective?: string; governor?: string; projectDir?: string };
      const projectId = p.projectId ?? "PRIDES-PROJECT";
      const objective = p.objective ?? "Build a production-ready system";
      const governor = p.governor ?? "human-operator";
      const projectDir = p.projectDir ?? ".";

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
      const createdDirs: string[] = [];

      for (const dir of dirs) {
        const fullPath = join(projectDir, dir);
        if (!existsSync(fullPath)) {
          mkdirSync(fullPath, { recursive: true });
          createdDirs.push(dir);
        }
      }

      const intentPath = join(projectDir, "intent.json");
      if (!existsSync(intentPath)) {
        writeFileSync(intentPath, JSON.stringify(intentJson, null, 2));
      }

      state.logArtifact("P", "scaffold-init", projectId);
      state.logArtifact("P", "intent.json", JSON.stringify(intentJson));

      return {
        intentJson,
        directories: dirs,
        created: createdDirs,
        message: `Scaffolded: ${projectId}. Created ${createdDirs.length} directories. Set phase P and begin.`,
      };
    },
  };
}

function buildReportTool(state: StateManager): ToolDefinition {
  return {
    name: TOOL_NAMES.REPORT,
    description: "Generate a full PRIDES session report: phase history, gate results, incidents, artifacts, and recommendations. Use for status checks and human review.",
    label: "PRIDES Session Report",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const report = state.getReport();
      return { report };
    },
  };
}

function buildTaskAddTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_task_add",
    description: "Add a task to the current phase plan. Returns the task ID.",
    label: "PRIDES Add Task",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Task description" },
      },
      required: ["description"],
    },
    execute: async (params: ToolParams) => {
      const id = state.addTask(String(params.description));
      return { id, message: `Task added: ${id}` };
    },
  };
}

function buildTaskCompleteTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_task_complete",
    description: "Mark a task as completed.",
    label: "PRIDES Complete Task",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to complete" },
      },
      required: ["taskId"],
    },
    execute: async (params: ToolParams) => {
      const ok = state.completeTask(String(params.taskId));
      return { success: ok, message: ok ? `Task completed: ${params.taskId}` : `Task not found or already done` };
    },
  };
}

function buildTaskListTool(state: StateManager): ToolDefinition {
  return {
    name: "prides_tasks",
    description: "List all tasks in the current phase plan with completion status.",
    label: "PRIDES Task List",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const plan = state.getTaskPlan();
      const progress = state.getPhaseProgress();
      return { plan, progress };
    },
  };
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
    buildTaskAddTool(state),
    buildTaskCompleteTool(state),
    buildTaskListTool(state),
  ];
}

export function buildCommand(ctx: { state: StateManager; tools: ToolDefinition[] }): RegisteredCommand {
  function findTool(name: string): ToolDefinition | undefined {
    return ctx.tools.find(t => t.name === name);
  }

  function requireTool(name: string): ToolDefinition {
    const tool = findTool(name);
    if (!tool) throw new Error(`${name} tool not found`);
    return tool;
  }

  return {
    name: "prides",
    description: "PRIDES framework: status, next, gates, hb, stop, report, scaffold, task",
    handler: async (args: string) => {
      try {
        const parts = args.trim().toLowerCase().split(/\s+/);
        const sub = parts[0];

        switch (sub) {
          case "status":
          case "s": {
            const tool = requireTool(TOOL_NAMES.STATUS);
            const result = await tool.execute({});
            return `Phase: ${result.phase} (${result.phaseName}) | Heartbeat: ${result.heartbeat.status} | Gates: ${result.gatesPassed}/${result.gatesTotal}`;
          }
          case "next": {
            const tool = requireTool(TOOL_NAMES.PHASE_ADVANCE);
            const result = await tool.execute({ force: false });
            if (result.blocked) {
              return `Blocked: ${result.message}`;
            }
            return `${result.message} (next: ${result.nextPhase})`;
          }
          case "gates":
          case "g": {
            const tool = requireTool(TOOL_NAMES.GATES);
            const result = await tool.execute({});
            return result.message;
          }
          case "hb":
          case "heartbeat": {
            const tool = requireTool(TOOL_NAMES.HEARTBEAT);
            const result = await tool.execute({ status: "healthy" });
            return result.message;
          }
          case "stop": {
            const tool = requireTool(TOOL_NAMES.EMERGENCY_STOP);
            const result = await tool.execute({ reason: "Manual emergency stop via /prides stop" });
            return result.message;
          }
          case "report":
          case "r": {
            const tool = requireTool(TOOL_NAMES.REPORT);
            const result = await tool.execute({});
            const r = result.report;
            return `Phase: ${r.currentPhase} | Artifacts: ${r.totalArtifacts} | Incidents: ${r.totalIncidents}\nRecommendations: ${r.recommendations.join("; ") || "None"}`;
          }
          case "scaffold": {
            const tool = requireTool(TOOL_NAMES.SCAFFOLD);
            const result = await tool.execute({});
            return `${result.message}\nDirectories: ${result.directories.join(", ")}`;
          }
          case "task":
          case "t": {
            const subCmd = parts[1]?.toLowerCase();
            if (subCmd === "add" && parts.length > 2) {
              const desc = parts.slice(2).join(" ");
              const tool = requireTool("prides_task_add");
              const result = await tool.execute({ description: desc });
              return result.message;
            }
            if (subCmd === "done" && parts[2]) {
              const tool = requireTool("prides_task_complete");
              const result = await tool.execute({ taskId: parts[2] });
              return result.message;
            }
            const tool = requireTool("prides_tasks");
            const result = await tool.execute({});
            const p = result.progress;
            if (p.total === 0) return "No tasks in current phase.";
            const lines = result.plan.tasks.map((t: { id: string; description: string; done: boolean }) =>
              `${t.done ? "✓" : "○"} ${t.description} (${t.id})`
            );
            return `Tasks: ${p.completed}/${p.total} (${p.percentage}%)\n${lines.join("\n")}`;
          }
          default: {
            return "PRIDES commands: status, next, gates, hb, stop, report, scaffold, task [add|done]";
          }
        }
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

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

  const unsubscribe = state.onChange((newPhase, gateResults) => {
    const cfg = CONFIG[newPhase];
    guard.update(newPhase, cfg.blockedTools);
    sessionGuard.update(newPhase, cfg.criticality, gateResults);
  });

  const tools = buildTools({ state });
  for (const tool of tools) {
    pi.registerTool(tool);
  }

  const command = buildCommand({ state, tools });
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

