export const PHASES = ["P", "R", "I", "D", "E", "S"] as const;
export type Phase = (typeof PHASES)[number];
export function nextPhase(p: Phase): Phase {
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
