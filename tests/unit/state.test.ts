import { describe, it } from "node:test";
import assert from "node:assert";
import { createState } from "../../src/state.js";

// ── Unit tests for state manager ─────────────────────────────────────────

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
});
