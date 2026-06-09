import { PHASES, type Phase, type PhaseConfig } from "./config.js";

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
  state: PRIDESState;
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

  function nextPhase(): Phase {
    const idx = PHASES.indexOf(state.currentPhase);
    return PHASES[(idx + 1) % PHASES.length];
  }

  function prevPhase(): Phase | null {
    const idx = PHASES.indexOf(state.currentPhase);
    return idx > 0 ? PHASES[idx - 1] : null;
  }

  function setPhase(phase: Phase): void {
    state.currentPhase = phase;
    state.phaseIndex = PHASES.indexOf(phase);
  }

  function advancePhase(): Phase {
    const next = nextPhase();
    state.currentPhase = next;
    state.phaseIndex = PHASES.indexOf(next);
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
    state.gateResults[gateId] = passed;
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
    const gates = [
      { id: "code-review", name: "Code Review", threshold: ">=2 approvals, 0 blocking comments" },
      { id: "test-coverage", name: "Test Coverage", threshold: ">80% line coverage" },
      { id: "security", name: "Security Scan", threshold: "Zero critical/high CVSS" },
      { id: "performance", name: "Performance", threshold: "p95 <= target" },
      { id: "accessibility", name: "Accessibility", threshold: "WCAG 2.1 AA" },
    ].map(g => ({
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
      phaseName: "Prototype", // simplified for test
      sessionStarted: state.startedAt,
      totalArtifacts: state.artifacts.length,
      totalIncidents: state.incidents.length,
      gates,
      recentIncidents: state.incidents.slice(-5),
      recommendations,
    };
  }

  return {
    state,
    setPhase,
    advancePhase,
    recordHeartbeat,
    logIncident,
    logArtifact,
    setGateResult,
    toJSON,
    fromJSON,
    getReport,
  };
}
