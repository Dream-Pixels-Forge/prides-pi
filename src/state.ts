import { PHASES, type Phase, CONFIG, nextPhase } from "./config.js";
import { GATES, type GateEvaluator, type GateContext, createDefaultGateEvaluator } from "./gates.js";

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