import { PHASES, type Phase, CONFIG } from "./config.js";
import { GATES } from "./gates.js";

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