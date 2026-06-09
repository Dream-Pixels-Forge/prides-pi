import { getPhaseConfig, type Phase } from "./config.js";

export interface ToolGuard {
  check: (toolName: string) => { blocked: boolean; reason?: string };
}

export function createToolGuard(phase: Phase, blockedTools: string[]): ToolGuard {
  const cfg = getPhaseConfig(phase);

  return {
    check: (toolName: string) => {
      if (blockedTools.includes(toolName)) {
        return {
          blocked: true,
          reason: `Tool "${toolName}" is blocked in Phase ${phase} (${cfg.name}). Use /prides to advance or override.`,
        };
      }
      return { blocked: false };
    },
  };
}

export interface SessionGuard {
  check: () => { blocked: boolean; reason?: string };
}

export function createSessionGuard(
  phase: Phase,
  gateResults: Record<string, boolean>,
  criticality: string,
  gates: { id: string; name: string }[]
): SessionGuard {
  const cfg = getPhaseConfig(phase);

  return {
    check: () => {
      if (criticality === "critical") {
        const failing = gates.filter(g => !gateResults[g.id]);
        if (failing.length > 0) {
          return {
            blocked: true,
            reason: `Cannot switch session — ${failing.length} quality gate(s) failing in critical phase ${phase} (${cfg.name}). Run /prides gates to check.`,
          };
        }
      }
      return { blocked: false };
    },
  };
}
