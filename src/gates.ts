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
