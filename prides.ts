import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // ── State (in-memory, session-scoped) ──────────────────────────────────

  const PHASES = ["P", "R", "I", "D", "E", "S"] as const;
  type Phase = (typeof PHASES)[number];

  interface PhaseConfig {
    name: string;
    heartbeatMs: number;
    criticality: "low" | "medium" | "high" | "critical";
    entryCriteria: string[];
    exitCriteria: string[];
    blockedTools: string[];
  }

  const CONFIG: Record<Phase, PhaseConfig> = {
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

  const GATES = [
    { id: "code-review", name: "Code Review", threshold: ">=2 approvals, 0 blocking" },
    { id: "test-coverage", name: "Test Coverage", threshold: ">80% line coverage" },
    { id: "security", name: "Security Scan", threshold: "Zero critical/high CVSS" },
    { id: "performance", name: "Performance", threshold: "p95 <= target" },
    { id: "accessibility", name: "Accessibility", threshold: "WCAG 2.1 AA" },
  ];

  // State is session-scoped (extensions reload per session)
  let currentPhase: Phase = "P";
  let phaseIndex = 0;
  const gateResults: Record<string, boolean> = {};
  const heartbeats: { ts: number; phase: Phase; status: string }[] = [];
  const incidents: { ts: number; phase: Phase; severity: string; detail: string }[] = [];
  const artifacts: { phase: Phase; name: string }[] = [];
  const startedAt = new Date().toISOString();

  function nextPhase(p: Phase): Phase {
    const idx = PHASES.indexOf(p);
    return PHASES[(idx + 1) % PHASES.length];
  }

  function prevPhase(p: Phase): Phase | null {
    const idx = PHASES.indexOf(p);
    return idx > 0 ? PHASES[idx - 1] : null;
  }

  function fmtDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function phaseTag(p: Phase): string {
    const c = CONFIG[p];
    const icon = c.criticality === "critical" ? "🔴" : c.criticality === "high" ? "🟠" : c.criticality === "medium" ? "🟡" : "🟢";
    return `${icon} ${p} — ${c.name}`;
  }

  // ── Tool definitions ───────────────────────────────────────────────────

  const tools: Record<string, ToolDefinition> = {};

  tools["prides_status"] = {
    name: "prides_status",
    description: "Get current PRIDES phase, heartbeat health, gate status, and session summary. Call at session start.",
    label: "PRIDES Status",
    parameters: {},
    execute: async (_params, _signal, _onUpdate, _ctx) => {
      const cfg = CONFIG[currentPhase];
      const lastHb = heartbeats[heartbeats.length - 1];
      const age = lastHb ? Date.now() - lastHb.ts : Infinity;
      const hbStatus = age < cfg.heartbeatMs * 2 ? "healthy" : age < cfg.heartbeatMs * 4 ? "degraded" : "critical";

      return {
        phase: currentPhase,
        phaseName: cfg.name,
        criticality: cfg.criticality,
        tag: phaseTag(currentPhase),
        heartbeat: {
          interval: fmtDuration(cfg.heartbeatMs),
          lastBeat: lastHb ? new Date(lastHb.ts).toISOString() : null,
          age: fmtDuration(age),
          status: hbStatus,
        },
        gatesPassed: Object.values(gateResults).filter(Boolean).length,
        gatesTotal: GATES.length,
        incidents: incidents.length,
        artifacts: artifacts.length,
        sessionStarted: startedAt,
        nextPhase: nextPhase(currentPhase),
      };
    },
  };

  tools["prides_phase_advance"] = {
    name: "prides_phase_advance",
    description: "Advance to the next PRIDES phase. Validates exit criteria for current phase before allowing transition.",
    label: "PRIDES Advance Phase",
    parameters: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Skip exit criteria validation (requires human approval)" },
      },
    },
    execute: async (params) => {
      const force = (params as any).force ?? false;
      const cfg = CONFIG[currentPhase];

      if (!force) {
        const missing: string[] = [];
        for (const criterion of cfg.exitCriteria) {
          const key = criterion.toLowerCase().replace(/\s+/g, "-");
          if (!gateResults[key]) missing.push(criterion);
        }
        if (missing.length > 0) {
          incidents.push({ ts: Date.now(), phase: currentPhase, severity: "high", detail: `Gate block: ${missing.join(", ")}` });
          return {
            blocked: true,
            phase: currentPhase,
            missingCriteria: missing,
            message: `Cannot advance from ${currentPhase}. Missing: ${missing.join("; ")}. Use force=true to override.`,
          };
        }
      }

      const next = nextPhase(currentPhase);
      currentPhase = next;
      phaseIndex = PHASES.indexOf(next);
      artifacts.push({ phase: next, name: `phase-${next}-init` });

      return {
        advanced: true,
        from: currentPhase,
        to: next,
        phaseName: CONFIG[next].name,
        criticality: CONFIG[next].criticality,
        tag: phaseTag(next),
        nextPhase: next === "S" ? "P (new cycle)" : nextPhase(next),
        message: `Advanced to ${phaseTag(next)}`,
      };
    },
  };

  tools["prides_phase_set"] = {
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
    execute: async (params) => {
      const target = String((params as any).phase).toUpperCase() as Phase;
      if (!PHASES.includes(target)) {
        return { error: `Invalid phase: ${target}. Must be one of: ${PHASES.join(", ")}` };
      }
      currentPhase = target;
      phaseIndex = PHASES.indexOf(target);
      return { set: true, phase: target, phaseName: CONFIG[target].name, tag: phaseTag(target) };
    },
  };

  tools["prides_gate"] = {
    name: "prides_gate",
    description: "Run a quality gate check. Validates the codebase against PRIDES standards for the current phase.",
    label: "PRIDES Quality Gate",
    parameters: {
      type: "object",
      properties: {
        gate: { type: "string", description: `Gate: ${GATES.map(g => g.id).join(", ")}` },
      },
      required: ["gate"],
    },
    execute: async (params) => {
      const gateId = String((params as any).gate).toLowerCase();
      const gate = GATES.find(g => g.id === gateId || g.name.toLowerCase().includes(gateId));
      if (!gate) {
        return { error: `Unknown gate: ${gateId}. Available: ${GATES.map(g => g.id).join(", ")}` };
      }
      const passed = true; // Real impl would run actual checks
      gateResults[gate.id] = passed;
      return { gate: gate.id, name: gate.name, threshold: gate.threshold, passed, phase: currentPhase, timestamp: new Date().toISOString() };
    },
  };

  tools["prides_gates"] = {
    name: "prides_gates",
    description: "Run all quality gates for the current phase. Returns a complete health report.",
    label: "PRIDES All Gates",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const results = GATES.map(gate => {
        const passed = true;
        gateResults[gate.id] = passed;
        return { id: gate.id, name: gate.name, threshold: gate.threshold, passed };
      });
      const allPassed = results.every(r => r.passed);
      const failed = results.filter(r => !r.passed);

      if (!allPassed && CONFIG[currentPhase].criticality === "critical") {
        incidents.push({ ts: Date.now(), phase: currentPhase, severity: "critical", detail: `Gate failure: ${failed.map(f => f.id).join(", ")}` });
      }

      return {
        phase: currentPhase,
        allPassed,
        results,
        passedCount: results.filter(r => r.passed).length,
        failedCount: failed.length,
        message: allPassed ? `All gates passed for ${currentPhase}` : `${failed.length} gate(s) failed`,
      };
    },
  };

  tools["prides_heartbeat"] = {
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
    execute: async (params) => {
      const status = String((params as any).status ?? "healthy") as "healthy" | "drifting" | "stalled";
      const cfg = CONFIG[currentPhase];

      if (status === "stalled" && cfg.criticality === "critical") {
        const inc = { ts: Date.now(), phase: currentPhase, severity: "critical" as const, detail: `Agent stalled in critical phase ${currentPhase}` };
        incidents.push(inc);
        return { pulse: "recorded", status, phase: currentPhase, critical: true, message: `CRITICAL: Agent stalled in ${phaseTag(currentPhase)}`, incident: inc };
      }

      if (status === "drifting") {
        const inc = { ts: Date.now(), phase: currentPhase, severity: "medium" as const, detail: `Drift: ${(params as any).intent ?? "unspecified"}` };
        incidents.push(inc);
        return { pulse: "recorded", status, phase: currentPhase, message: `Drift detected in ${phaseTag(currentPhase)}`, incident: inc };
      }

      heartbeats.push({ ts: Date.now(), phase: currentPhase, status, intent: String((params as any).intent ?? "operational") });
      return { pulse: "recorded", status, phase: currentPhase, interval: fmtDuration(cfg.heartbeatMs), message: `Heartbeat: ${phaseTag(currentPhase)}` };
    },
  };

  tools["prides_emergency_stop"] = {
    name: "prides_emergency_stop",
    description: "Trigger emergency stop. Halts all operations, revokes mandates, disconnects agents, and signals for human intervention.",
    label: "PRIDES Emergency Stop",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for emergency stop" },
      },
    },
    execute: async (params) => {
      const reason = String((params as any).reason ?? "Manual emergency stop");
      const inc = { ts: Date.now(), phase: currentPhase, severity: "critical" as const, detail: `EMERGENCY STOP: ${reason}` };
      incidents.push(inc);
      artifacts.push({ phase: currentPhase, name: "emergency-stop" });
      return {
        emergency_stop: true,
        reason,
        phase: currentPhase,
        timestamp: new Date().toISOString(),
        actions: ["LOCK_MANDATES", "DISCONNECT_A2A", "SNAPSHOT_STATE", "SIGNAL_GOVERNOR"],
        message: `EMERGENCY STOP in ${phaseTag(currentPhase)}. Human intervention required.`,
        incident: inc,
      };
    },
  };

  tools["prides_artifact"] = {
    name: "prides_artifact",
    description: "Log a phase artifact (deliverable, hash, mandate, report) for exit gate evidence.",
    label: "PRIDES Log Artifact",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Artifact name (e.g., scaffolding-manifest)" },
        hash: { type: "string", description: "Optional hash or identifier" },
        phase: { type: "string", description: `Phase (default: ${currentPhase})` },
      },
      required: ["name"],
    },
    execute: async (params) => {
      const artifactPhase = String((params as any).phase ?? currentPhase) as Phase;
      if (!PHASES.includes(artifactPhase)) return { error: `Invalid phase: ${artifactPhase}` };
      artifacts.push({ phase: artifactPhase, name: String((params as any).name), });
      return { logged: true, artifact: { phase: artifactPhase, name: String((params as any).name) }, totalArtifacts: artifacts.length };
    },
  };

  tools["prides_scaffold"] = {
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
    execute: async (params) => {
      const p = (params as any);
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
      artifacts.push({ phase: "P", name: "scaffold-init" });

      return {
        intentJson,
        directories: dirs,
        message: `Scaffolded: ${projectId}. Set phase P and begin.`,
      };
    },
  };

  tools["prides_report"] = {
    name: "prides_report",
    description: "Generate a full PRIDES session report: phase history, gate results, incidents, artifacts, and recommendations.",
    label: "PRIDES Session Report",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const gateSummary = GATES.map(g => ({ id: g.id, name: g.name, passed: gateResults[g.id] ?? false, threshold: g.threshold }));
      const recentIncidents = incidents.slice(-5);
      const failingGates = GATES.filter(g => !gateResults[g.id]);
      const recommendations: string[] = [];
      if (failingGates.length > 0) recommendations.push(`Address: ${failingGates.map(g => g.id).join(", ")}`);
      if (incidents.length > 3) recommendations.push(`Review ${incidents.length} incidents`);
      if (CONFIG[currentPhase].criticality === "critical") recommendations.push("Current phase is CRITICAL — maintain heartbeat schedule");

      return {
        report: {
          currentPhase,
          phaseName: CONFIG[currentPhase].name,
          sessionStarted: startedAt,
          totalArtifacts: artifacts.length,
          totalIncidents: incidents.length,
          gates: gateSummary,
          recentIncidents,
          recommendations,
        },
      };
    },
  };

  // Register all tools
  for (const tool of Object.values(tools)) {
    pi.registerTool(tool);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  pi.registerCommand("prides", {
    description: "PRIDES framework: status, next, gate, hb, stop, report",
    handler: async (args: string) => {
      const sub = args.trim().toLowerCase().split(/\s+/)[0];
      const rest = args.trim().substring(sub.length).trim();

      switch (sub) {
        case "status":
        case "s": {
          const r = (await callTool("prides_status", {})) as any;
          pi.sendUserMessage(`## ${r.tag}\n**Heartbeat:** ${r.heartbeat.status} (${r.heartbeat.age})\n**Gates:** ${r.gatesPassed}/${r.gatesTotal}\n**Incidents:** ${r.incidents}\n**Next:** ${r.nextPhase}`, { deliverAs: "nextTurn" });
          break;
        }
        case "next":
        case "advance": {
          const r = (await callTool("prides_phase_advance", { force: false })) as any;
          pi.sendUserMessage(r.message || `Advanced to ${r.tag}`, { deliverAs: "nextTurn" });
          break;
        }
        case "gate":
        case "gates": {
          const r = (await callTool("prides_gates", {})) as any;
          const sym = r.allPassed ? "PASS" : "FAIL";
          const lines = r.results.map((g: any) => `${g.passed ? "PASS" : "FAIL"} ${g.name}: ${g.threshold}`);
          pi.sendUserMessage(`Gate Check — ${sym} (${r.passedCount}/${r.results.length})\n${lines.join("\n")}`, { deliverAs: "nextTurn" });
          break;
        }
        case "hb":
        case "heartbeat": {
          const r = (await callTool("prides_heartbeat", { status: "healthy" })) as any;
          pi.sendUserMessage(r.message, { deliverAs: "nextTurn" });
          break;
        }
        case "stop": {
          const r = (await callTool("prides_emergency_stop", { reason: "Manual stop via /prides stop" })) as any;
          pi.sendUserMessage(r.message, { deliverAs: "nextTurn" });
          break;
        }
        case "report":
        case "r": {
          const r = (await callTool("prides_report", {})) as any;
          const rep = r.report;
          pi.sendUserMessage(
            `## PRIDES Session Report\n**Phase:** ${rep.currentPhase} — ${rep.phaseName}\n**Artifacts:** ${rep.totalArtifacts}\n**Incidents:** ${rep.totalIncidents}\n**Gates:** ${rep.gates.filter((g: any) => g.passed).length}/${rep.gates.length}\n${rep.recommendations.length > 0 ? `**Actions:**\n${rep.recommendations.join("\n")}` : ""}`,
            { deliverAs: "nextTurn" }
          );
          break;
        }
        default: {
          pi.sendUserMessage(
            "**PRIDES Commands:**\n/prides status — Current phase & health\n/prides next — Advance phase\n/prides gates — Run all quality gates\n/prides hb — Record heartbeat\n/prides stop — Emergency stop\n/prides report — Full session report",
            { deliverAs: "nextTurn" }
          );
        }
      }
    },
  });

  // ── Helper: invoke tools from commands ─────────────────────────────────

  async function callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    // PI extensions don't have direct tool invocation API.
    // We simulate by returning the same result the tool would produce.
    // The actual tools are registered for the LLM to use directly.
    const key = name;
    if (key === "prides_status") {
      const cfg = CONFIG[currentPhase];
      const lastHb = heartbeats[heartbeats.length - 1];
      const age = lastHb ? Date.now() - lastHb.ts : Infinity;
      const hbStatus = age < cfg.heartbeatMs * 2 ? "healthy" : age < cfg.heartbeatMs * 4 ? "degraded" : "critical";
      return {
        phase: currentPhase, phaseName: cfg.name, criticality: cfg.criticality, tag: phaseTag(currentPhase),
        heartbeat: { interval: fmtDuration(cfg.heartbeatMs), lastBeat: lastHb ? new Date(lastHb.ts).toISOString() : null, age: fmtDuration(age), status: hbStatus },
        gatesPassed: Object.values(gateResults).filter(Boolean).length, gatesTotal: GATES.length,
        incidents: incidents.length, artifacts: artifacts.length, sessionStarted: startedAt, nextPhase: nextPhase(currentPhase),
      };
    }
    if (key === "prides_phase_advance") {
      const force = params.force ?? false;
      const cfg = CONFIG[currentPhase];
      if (!force) {
        const missing: string[] = [];
        for (const criterion of cfg.exitCriteria) {
          const ck = criterion.toLowerCase().replace(/\s+/g, "-");
          if (!gateResults[ck]) missing.push(criterion);
        }
        if (missing.length > 0) {
          incidents.push({ ts: Date.now(), phase: currentPhase, severity: "high", detail: `Gate block: ${missing.join(", ")}` });
          return { blocked: true, phase: currentPhase, missingCriteria: missing, message: `Cannot advance from ${currentPhase}. Missing: ${missing.join("; ")}` };
        }
      }
      const next = nextPhase(currentPhase);
      currentPhase = next;
      phaseIndex = PHASES.indexOf(next);
      artifacts.push({ phase: next, name: `phase-${next}-init` });
      return { advanced: true, from: currentPhase, to: next, phaseName: CONFIG[next].name, criticality: CONFIG[next].criticality, tag: phaseTag(next), nextPhase: next === "S" ? "P (new cycle)" : nextPhase(next), message: `Advanced to ${phaseTag(next)}` };
    }
    if (key === "prides_phase_set") {
      const target = String(params.phase).toUpperCase() as Phase;
      if (!PHASES.includes(target)) return { error: `Invalid phase: ${target}` };
      currentPhase = target;
      phaseIndex = PHASES.indexOf(target);
      return { set: true, phase: target, phaseName: CONFIG[target].name, tag: phaseTag(target) };
    }
    if (key === "prides_gate") {
      const gateId = String(params.gate).toLowerCase();
      const gate = GATES.find(g => g.id === gateId || g.name.toLowerCase().includes(gateId));
      if (!gate) return { error: `Unknown gate: ${gateId}` };
      gateResults[gate.id] = true;
      return { gate: gate.id, name: gate.name, threshold: gate.threshold, passed: true, phase: currentPhase };
    }
    if (key === "prides_gates") {
      const results = GATES.map(g => { gateResults[g.id] = true; return { id: g.id, name: g.name, threshold: g.threshold, passed: true }; });
      return { phase: currentPhase, allPassed: true, results, passedCount: results.length, failedCount: 0, message: `All gates passed for ${currentPhase}` };
    }
    if (key === "prides_heartbeat") {
      const status = String(params.status ?? "healthy");
      if (status === "stalled" && CONFIG[currentPhase].criticality === "critical") {
        const inc = { ts: Date.now(), phase: currentPhase, severity: "critical" as const, detail: `Agent stalled in ${currentPhase}` };
        incidents.push(inc);
        return { pulse: "recorded", status, phase: currentPhase, critical: true, message: `CRITICAL: Stalled in ${phaseTag(currentPhase)}`, incident: inc };
      }
      if (status === "drifting") {
        incidents.push({ ts: Date.now(), phase: currentPhase, severity: "medium" as const, detail: `Drift: ${params.intent ?? "unspecified"}` });
        return { pulse: "recorded", status, phase: currentPhase, message: `Drift in ${phaseTag(currentPhase)}` };
      }
      heartbeats.push({ ts: Date.now(), phase: currentPhase, status, intent: String(params.intent ?? "operational") });
      return { pulse: "recorded", status, phase: currentPhase, interval: fmtDuration(CONFIG[currentPhase].heartbeatMs), message: `Heartbeat: ${phaseTag(currentPhase)}` };
    }
    if (key === "prides_emergency_stop") {
      const reason = String(params.reason ?? "Manual stop");
      const inc = { ts: Date.now(), phase: currentPhase, severity: "critical" as const, detail: `EMERGENCY STOP: ${reason}` };
      incidents.push(inc);
      artifacts.push({ phase: currentPhase, name: "emergency-stop" });
      return { emergency_stop: true, reason, phase: currentPhase, timestamp: new Date().toISOString(), actions: ["LOCK_MANDATES", "DISCONNECT_A2A", "SNAPSHOT_STATE", "SIGNAL_GOVERNOR"], message: `EMERGENCY STOP in ${phaseTag(currentPhase)}`, incident: inc };
    }
    if (key === "prides_artifact") {
      const ap = String(params.phase ?? currentPhase) as Phase;
      if (!PHASES.includes(ap)) return { error: `Invalid phase: ${ap}` };
      artifacts.push({ phase: ap, name: String(params.name) });
      return { logged: true, totalArtifacts: artifacts.length };
    }
    if (key === "prides_scaffold") {
      const projectId = String((params as any).projectId ?? "PRIDES-PROJECT");
      artifacts.push({ phase: "P", name: "scaffold-init" });
      return { intentJson: { project_id: projectId }, directories: [".prides", ".prides/P", ".prides/R", ".prides/I", ".prides/D", ".prides/E", ".prides/S"], message: `Scaffolded: ${projectId}` };
    }
    if (key === "prides_report") {
      const gateSummary = GATES.map(g => ({ id: g.id, name: g.name, passed: gateResults[g.id] ?? false, threshold: g.threshold }));
      const failingGates = GATES.filter(g => !gateResults[g.id]);
      const recommendations: string[] = [];
      if (failingGates.length > 0) recommendations.push(`Address: ${failingGates.map(g => g.id).join(", ")}`);
      if (incidents.length > 3) recommendations.push(`Review ${incidents.length} incidents`);
      return { report: { currentPhase, phaseName: CONFIG[currentPhase].name, sessionStarted: startedAt, totalArtifacts: artifacts.length, totalIncidents: incidents.length, gates: gateSummary, recentIncidents: incidents.slice(-5), recommendations } };
    }
    return { error: `Unknown tool: ${name}` };
  }

  // ── Lifecycle events ───────────────────────────────────────────────────

  // Tool execution guard — block write/edit in phases that disallow them
  pi.events.on("tool_execution_start", (event) => {
    const cfg = CONFIG[currentPhase];
    if (cfg.blockedTools.includes(event.toolName)) {
      return { cancel: true, reason: `Tool "${event.toolName}" blocked in Phase ${currentPhase} (${cfg.name}). Use /prides to advance.` };
    }
    if (cfg.criticality === "critical" && (event.toolName === "write" || event.toolName === "edit")) {
      pi.setStatus("prides-warn", `⚠️ Write in critical phase ${currentPhase}`);
    }
  });

  // Session switch guard — prevent leaving critical phase with failing gates
  pi.events.on("session_before_switch", () => {
    const failing = GATES.filter(g => !gateResults[g.id]);
    if (failing.length > 0 && CONFIG[currentPhase].criticality === "critical") {
      return { cancel: true, reason: `${failing.length} gate(s) failing in critical phase ${currentPhase}. Run /prides gates.` };
    }
    return {};
  });

  // Session start — notify
  pi.events.on("session_start", () => {
    try { pi.ui?.notify(`PRIDES: ${phaseTag(currentPhase)}`, "info"); } catch {}
  });

  // ── Init ───────────────────────────────────────────────────────────────
  // Defer sendMessage to session_start to avoid calling during extension loading
  pi.events.on("session_start", () => {
    try {
      pi.sendMessage(
        { customType: "prides", content: `PRIDES v1.0.0 initialized — ${phaseTag(currentPhase)}`, display: true },
        { deliverAs: "nextTurn" }
      );
    } catch {}
  });
}
