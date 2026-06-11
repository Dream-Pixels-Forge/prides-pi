import { describe, it } from "node:test";
import assert from "node:assert";
import { createState } from "../../src/state.js";
import { HEARTBEAT_THRESHOLDS } from "../../src/state.js";
import { validateGate } from "../../src/gates.js";

describe("Heartbeat Thresholds", () => {
  it("should export heartbeat threshold constants", () => {
    assert.strictEqual(HEARTBEAT_THRESHOLDS.HEALTHY, 2);
    assert.strictEqual(HEARTBEAT_THRESHOLDS.DEGRADED, 4);
  });
});

describe("State Manager", () => {
  it("should create initial state in Phase P", () => {
    const state = createState();
    assert.strictEqual(state.state.currentPhase, "P");
    assert.strictEqual(state.state.phaseIndex, 0);
    assert.deepStrictEqual(state.state.gateResults, {});
    assert.deepStrictEqual(state.state.heartbeats, []);
    assert.deepStrictEqual(state.state.incidents, []);
    assert.deepStrictEqual(state.state.artifacts, []);
    assert.ok(state.state.startedAt);
  });

  it("should allow phase transitions", () => {
    const state = createState();
    assert.strictEqual(state.state.currentPhase, "P");
  });

  it("should advance phase correctly", () => {
    const state = createState();
    const next = state.advancePhase();
    assert.strictEqual(next, "R");
    assert.strictEqual(state.state.currentPhase, "R");
    assert.strictEqual(state.state.phaseIndex, 1);
    assert.ok(state.state.artifacts.some(a => a.name === "phase-R-init"));
  });

  it("should notify subscribers on phase change", () => {
    const state = createState();
    let notifiedPhase: string | null = null;
    let notifiedGates: Record<string, boolean> | null = null;
    state.onChange((phase, gateResults) => { notifiedPhase = phase; notifiedGates = gateResults; });
    state.setPhase("I");
    assert.strictEqual(notifiedPhase, "I");
    assert.strictEqual(notifiedGates, state.state.gateResults);
  });

  it("should notify subscribers on advancePhase", () => {
    const state = createState();
    let notifiedPhase: string | null = null;
    state.onChange((phase) => { notifiedPhase = phase; });
    state.advancePhase();
    assert.strictEqual(notifiedPhase, "R");
  });

  it("should normalize gate keys", () => {
    const state = createState();
    state.setGateResult("Code Review", true);
    assert.strictEqual(state.state.gateResults["code-review"], true);
    state.setGateResult("Test Coverage", false);
    assert.strictEqual(state.state.gateResults["test-coverage"], false);
  });

  it("should record heartbeats", () => {
    const state = createState();
    assert.strictEqual(state.state.heartbeats.length, 0);
    state.recordHeartbeat("healthy", "testing");
    assert.strictEqual(state.state.heartbeats.length, 1);
    assert.strictEqual(state.state.heartbeats[0].status, "healthy");
    assert.strictEqual(state.state.heartbeats[0].intent, "testing");
  });

  it("should log incidents", () => {
    const state = createState();
    assert.strictEqual(state.state.incidents.length, 0);
    state.logIncident("high", "Test incident");
    assert.strictEqual(state.state.incidents.length, 1);
    assert.strictEqual(state.state.incidents[0].severity, "high");
    assert.strictEqual(state.state.incidents[0].detail, "Test incident");
  });

  it("should log artifacts", () => {
    const state = createState();
    assert.strictEqual(state.state.artifacts.length, 0);
    state.logArtifact("P", "scaffold-init", "abc123");
    assert.strictEqual(state.state.artifacts.length, 1);
    assert.strictEqual(state.state.artifacts[0].name, "scaffold-init");
    assert.strictEqual(state.state.artifacts[0].hash, "abc123");
  });

  it("should set gate results", () => {
    const state = createState();
    state.setGateResult("code-review", true);
    assert.strictEqual(state.state.gateResults["code-review"], true);
    state.setGateResult("test-coverage", false);
    assert.strictEqual(state.state.gateResults["test-coverage"], false);
  });

  it("should serialize to JSON", () => {
    const state = createState();
    state.recordHeartbeat("healthy");
    const json = state.toJSON();
    assert.ok(json.includes("heartbeats"));
    assert.ok(json.includes("currentPhase"));
  });

  it("should deserialize from JSON", () => {
    const state = createState();
    state.recordHeartbeat("healthy", "test");
    const json = state.toJSON();
    const state2 = createState();
    state2.fromJSON(json);
    assert.strictEqual(state2.state.heartbeats.length, 1);
    assert.strictEqual(state2.state.heartbeats[0].intent, "test");
  });

  it("should generate report", () => {
    const state = createState();
    const report = state.getReport();
    assert.ok(report);
    assert.strictEqual(report.currentPhase, "P");
    assert.ok(Array.isArray(report.gates));
    assert.ok(Array.isArray(report.recommendations));
  });

  it("should report correct phase name after phase change", () => {
    const state = createState();
    assert.strictEqual(state.getReport().phaseName, "Prototype");
    state.setPhase("I");
    assert.strictEqual(state.getReport().phaseName, "Implement");
    state.setPhase("S");
    assert.strictEqual(state.getReport().phaseName, "Secure");
  });
});

describe("fromJSON validation", () => {
  it("should reject invalid phase in JSON", () => {
    const state = createState();
    assert.throws(() => {
      state.fromJSON(JSON.stringify({ currentPhase: "X", phaseIndex: 0 }));
    }, /Invalid phase/);
  });

  it("should reject missing currentPhase", () => {
    const state = createState();
    assert.throws(() => {
      state.fromJSON(JSON.stringify({ phaseIndex: 0 }));
    }, /Invalid phase/);
  });

  it("should reject non-string currentPhase", () => {
    const state = createState();
    assert.throws(() => {
      state.fromJSON(JSON.stringify({ currentPhase: 42 }));
    }, /Invalid phase/);
  });

  it("should accept valid phase JSON", () => {
    const state = createState();
    state.fromJSON(JSON.stringify({ currentPhase: "D", phaseIndex: 3, gateResults: {}, heartbeats: [], incidents: [], artifacts: [], startedAt: "2026-01-01T00:00:00.000Z" }));
    assert.strictEqual(state.state.currentPhase, "D");
  });
});

describe("advancePhase resets gate results", () => {
  it("should clear gateResults on phase advance", () => {
    const state = createState("P");
    state.setGateResult("code-review", true);
    state.setGateResult("security", true);
    assert.strictEqual(state.state.gateResults["code-review"], true);
    state.advancePhase();
    assert.deepStrictEqual(state.state.gateResults, {});
  });
});

describe("onChange returns unsubscribe", () => {
  it("should stop notifying after unsubscribe", () => {
    const state = createState("P");
    let calls = 0;
    const unsub = state.onChange(() => { calls++; });
    state.setPhase("R");
    assert.strictEqual(calls, 1);
    unsub();
    state.setPhase("I");
    assert.strictEqual(calls, 1);
  });
});

describe("onChange receives gateResults", () => {
  it("should pass current gateResults to subscriber on setPhase", () => {
    const state = createState("P");
    state.setGateResult("code-review", true);
    state.setGateResult("security", false);
    let receivedGates: Record<string, boolean> | null = null;
    state.onChange((_phase, gateResults) => { receivedGates = gateResults; });
    state.setPhase("R");
    assert.ok(receivedGates);
    assert.strictEqual(receivedGates["code-review"], true);
    assert.strictEqual(receivedGates["security"], false);
  });

  it("should pass updated gateResults after setGateResult then setPhase", () => {
    const state = createState("P");
    let receivedGates: Record<string, boolean> | null = null;
    state.onChange((_phase, gateResults) => { receivedGates = gateResults; });
    state.setGateResult("code-review", true);
    state.setPhase("R");
    assert.ok(receivedGates);
    assert.strictEqual(receivedGates["code-review"], true);
  });
});

describe("setGateResult returns boolean", () => {
  it("should return true for valid gate ID", () => {
    const state = createState("P");
    const result = state.setGateResult("code-review", true);
    assert.strictEqual(result, true);
  });

  it("should return false for unknown gate ID", () => {
    const state = createState("P");
    const result = state.setGateResult("unknown-gate", true);
    assert.strictEqual(result, false);
  });

  it("should normalize gate keys before validation", () => {
    const state = createState("P");
    const result = state.setGateResult("Code Review", true);
    assert.strictEqual(result, true);
    assert.strictEqual(state.state.gateResults["code-review"], true);
  });
});

describe("advancePhase validation", () => {
  it("should advance through full phase cycle", () => {
    const state = createState("P");
    assert.strictEqual(state.advancePhase(), "R");
    assert.strictEqual(state.advancePhase(), "I");
    assert.strictEqual(state.advancePhase(), "D");
    assert.strictEqual(state.advancePhase(), "E");
    assert.strictEqual(state.advancePhase(), "S");
    assert.strictEqual(state.advancePhase(), "P");
    assert.strictEqual(state.state.currentPhase, "P");
  });
});

describe("Task Plan", () => {
  it("should start with null task plan", () => {
    const state = createState("P");
    assert.strictEqual(state.getTaskPlan(), null);
  });

  it("should add a task", () => {
    const state = createState("P");
    const id = state.addTask("Implement feature X");
    assert.ok(id.startsWith("task-"));
    const plan = state.getTaskPlan();
    assert.ok(plan);
    assert.strictEqual(plan.tasks.length, 1);
    assert.strictEqual(plan.tasks[0].description, "Implement feature X");
    assert.strictEqual(plan.tasks[0].done, false);
  });

  it("should complete a task", () => {
    const state = createState("P");
    const id = state.addTask("Write tests");
    const ok = state.completeTask(id);
    assert.strictEqual(ok, true);
    const plan = state.getTaskPlan();
    assert.ok(plan);
    assert.strictEqual(plan.tasks[0].done, true);
    assert.ok(plan.tasks[0].completedAt);
  });

  it("should return false when completing unknown task", () => {
    const state = createState("P");
    const ok = state.completeTask("task-nonexistent");
    assert.strictEqual(ok, false);
  });

  it("should return false when completing already completed task", () => {
    const state = createState("P");
    const id = state.addTask("Done task");
    state.completeTask(id);
    const ok = state.completeTask(id);
    assert.strictEqual(ok, false);
  });

  it("should calculate phase progress", () => {
    const state = createState("P");
    state.addTask("Task 1");
    const id2 = state.addTask("Task 2");
    state.addTask("Task 3");
    state.completeTask(id2);
    const progress = state.getPhaseProgress();
    assert.strictEqual(progress.total, 3);
    assert.strictEqual(progress.completed, 1);
    assert.strictEqual(progress.percentage, 33);
  });

  it("should return zero progress when no tasks", () => {
    const state = createState("P");
    const progress = state.getPhaseProgress();
    assert.strictEqual(progress.total, 0);
    assert.strictEqual(progress.completed, 0);
    assert.strictEqual(progress.percentage, 0);
  });

  it("should set a custom task plan", () => {
    const state = createState("P");
    state.setTaskPlan({
      phase: "I",
      tasks: [
        { id: "custom-1", description: "Custom task", done: false },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const plan = state.getTaskPlan();
    assert.ok(plan);
    assert.strictEqual(plan.phase, "I");
    assert.strictEqual(plan.tasks.length, 1);
  });
});

describe("Event Sourcing", () => {
  it("should start with empty events", () => {
    const state = createState("P");
    assert.deepStrictEqual(state.getEvents(), []);
  });

  it("should append events on gate result", () => {
    const state = createState("P");
    state.setGateResult("code-review", true);
    const events = state.getEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "gate_result");
    assert.strictEqual(events[0].payload.gateId, "code-review");
    assert.strictEqual(events[0].payload.passed, true);
  });

  it("should append events on task operations", () => {
    const state = createState("P");
    const id = state.addTask("Test event");
    state.completeTask(id);
    const events = state.getEvents();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, "task_updated");
    assert.strictEqual(events[0].payload.action, "add");
    assert.strictEqual(events[1].payload.action, "complete");
  });

  it("should filter events by type", () => {
    const state = createState("P");
    state.setGateResult("code-review", true);
    state.addTask("Filter test");
    const gateEvents = state.getEvents({ type: "gate_result" });
    assert.strictEqual(gateEvents.length, 1);
    const taskEvents = state.getEvents({ type: "task_updated" });
    assert.strictEqual(taskEvents.length, 1);
  });

  it("should filter events by since timestamp", () => {
    const state = createState("P");
    state.setGateResult("code-review", true);
    // All events should be returned when since is the beginning
    const all = state.getEvents({ since: "2000-01-01T00:00:00.000Z" });
    assert.ok(all.length >= 1);
    // No events should be returned when since is far future
    const none = state.getEvents({ since: "2099-01-01T00:00:00.000Z" });
    assert.strictEqual(none.length, 0);
  });
});

describe("Gate Evaluator Integration", () => {
  it("should use default evaluator", () => {
    const state = createState("P");
    const result = state.evaluateGate("code-review");
    assert.strictEqual(typeof result.passed, "boolean");
  });

  it("should use custom evaluator", () => {
    const state = createState("P");
    state.setGateEvaluator(() => ({ passed: true, reason: "custom" }));
    const result = state.evaluateGate("code-review");
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.reason, "custom");
  });

  it("should evaluate gates with artifact context", () => {
    const state = createState("P");
    state.logArtifact("P", "code-review-done");
    state.logArtifact("P", "plan.md");
    const result = state.evaluateGate("code-review");
    assert.strictEqual(result.passed, true);
  });

  it("should record events on advancePhase", () => {
    const state = createState("P");
    state.advancePhase();
    const events = state.getEvents({ type: "phase_changed" });
    assert.ok(events.length >= 1);
  });
});

describe("MAX_HISTORY pruning", () => {
  it("should prune heartbeats when exceeding MAX_HISTORY", () => {
    const state = createState("P");
    // Add 105 heartbeats (MAX_HISTORY is 100)
    for (let i = 0; i < 105; i++) {
      state.recordHeartbeat("healthy", `beat-${i}`);
    }
    assert.strictEqual(state.state.heartbeats.length, 100);
    // Oldest should be pruned
    assert.strictEqual(state.state.heartbeats[0].intent, "beat-5");
  });

  it("should prune incidents when exceeding MAX_HISTORY", () => {
    const state = createState("P");
    for (let i = 0; i < 105; i++) {
      state.logIncident("low", `incident-${i}`);
    }
    assert.strictEqual(state.state.incidents.length, 100);
    assert.strictEqual(state.state.incidents[0].detail, "incident-5");
  });

  it("should prune artifacts when exceeding MAX_HISTORY", () => {
    const state = createState("P");
    for (let i = 0; i < 105; i++) {
      state.logArtifact("P", `artifact-${i}`);
    }
    assert.strictEqual(state.state.artifacts.length, 100);
  });

  it("should prune events when exceeding MAX_HISTORY", () => {
    const state = createState("P");
    for (let i = 0; i < 105; i++) {
      state.addTask(`task-${i}`);
    }
    assert.ok(state.state.events.length <= 100);
  });
});

describe("validateGate", () => {
  it("should return valid for known gate IDs", () => {
    const result = validateGate("code-review");
    assert.strictEqual(result.valid, true);
    assert.ok(result.gate);
    assert.strictEqual(result.gate.id, "code-review");
  });

  it("should match partial names with 3+ chars", () => {
    const result = validateGate("code");
    assert.strictEqual(result.valid, true);
  });

  it("should return invalid for unknown gates", () => {
    const result = validateGate("unknown-gate-xyz");
    assert.strictEqual(result.valid, false);
  });

  it("should be case-insensitive", () => {
    const result = validateGate("CODE-REVIEW");
    assert.strictEqual(result.valid, true);
  });
});

describe("setPhase validation edge cases", () => {
  it("should throw on lowercase phase", () => {
    const state = createState("P");
    assert.throws(() => {
      state.setPhase("p" as any);
    }, /Invalid phase/);
  });

  it("should throw on empty string", () => {
    const state = createState("P");
    assert.throws(() => {
      state.setPhase("" as any);
    }, /Invalid phase/);
  });

  it("should throw on numeric string", () => {
    const state = createState("P");
    assert.throws(() => {
      state.setPhase("1" as any);
    }, /Invalid phase/);
  });
});
