import { describe, it } from "node:test";
import assert from "node:assert";
import { getPhaseConfig } from "../../src/config.js";

// ── Unit tests for phase config ──────────────────────────────────────────

describe("Phase Config", () => {
  it("should return config for Phase P", () => {
    const cfg = getPhaseConfig("P");
    assert.strictEqual(cfg.name, "Prototype");
    assert.strictEqual(cfg.heartbeatMs, 30000);
    assert.strictEqual(cfg.criticality, "high");
  });

  it("should return config for Phase R", () => {
    const cfg = getPhaseConfig("R");
    assert.strictEqual(cfg.name, "Review");
    assert.strictEqual(cfg.heartbeatMs, 120000);
    assert.strictEqual(cfg.criticality, "high");
    assert.ok(cfg.blockedTools.includes("write"));
    assert.ok(cfg.blockedTools.includes("edit"));
  });

  it("should return config for Phase I", () => {
    const cfg = getPhaseConfig("I");
    assert.strictEqual(cfg.name, "Implement");
    assert.strictEqual(cfg.heartbeatMs, 30000);
    assert.strictEqual(cfg.criticality, "critical");
  });

  it("should return config for Phase D", () => {
    const cfg = getPhaseConfig("D");
    assert.strictEqual(cfg.name, "Deploy");
    assert.strictEqual(cfg.heartbeatMs, 60000);
    assert.strictEqual(cfg.criticality, "critical");
    assert.ok(cfg.blockedTools.includes("write"));
    assert.ok(cfg.blockedTools.includes("edit"));
  });

  it("should return config for Phase E", () => {
    const cfg = getPhaseConfig("E");
    assert.strictEqual(cfg.name, "Extend");
    assert.strictEqual(cfg.heartbeatMs, 300000);
    assert.strictEqual(cfg.criticality, "medium");
  });

  it("should return config for Phase S", () => {
    const cfg = getPhaseConfig("S");
    assert.strictEqual(cfg.name, "Secure");
    assert.strictEqual(cfg.heartbeatMs, 30000);
    assert.strictEqual(cfg.criticality, "critical");
    assert.ok(cfg.blockedTools.includes("write"));
    assert.ok(cfg.blockedTools.includes("edit"));
  });

  it("should throw on invalid phase", () => {
    assert.throws(() => getPhaseConfig("X"), /Invalid phase/);
    assert.throws(() => getPhaseConfig(""), /Invalid phase/);
    assert.throws(() => getPhaseConfig("prototype"), /Invalid phase/); // full names not allowed
  });
});
