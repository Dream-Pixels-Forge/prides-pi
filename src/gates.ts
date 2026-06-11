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
    g => g.id === normalized || (normalized.length >= 3 && g.name.toLowerCase().includes(normalized))
  );
  if (!gate) {
    return { valid: false };
  }
  return { valid: true, gate };
}
