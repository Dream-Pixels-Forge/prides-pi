import { CONFIG, type Phase, type PhaseConfig } from "./config.js";
import { GATES } from "./gates.js";

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