import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { PHASES, getPhaseConfig } from "../../src/config.js";
import { GATES, validateGate } from "../../src/gates.js";
import { createState } from "../../src/state.js";
import { createToolGuard, createSessionGuard } from "../../src/guards.js";

// ── Unit tests for PRIDES module exports ──────────────────────────────────

describe("PRIDES Module Structure", () => {
  it("should export PHASES array", () => {
    assert.ok(Array.isArray(PHASES));
    assert.deepStrictEqual(PHASES, ["P", "R", "I", "D", "E", "S"]);
  });

  it("should export getPhaseConfig function", () => {
    assert.strictEqual(typeof getPhaseConfig, "function");
  });

  it("should export GATES array", () => {
    assert.ok(Array.isArray(GATES));
    assert.ok(GATES.length >= 5);
  });

  it("should export validateGate function", () => {
    assert.strictEqual(typeof validateGate, "function");
  });

  it("should export createState function", () => {
    assert.strictEqual(typeof createState, "function");
  });

  it("should export createToolGuard function", () => {
    assert.strictEqual(typeof createToolGuard, "function");
  });

  it("should export createSessionGuard function", () => {
    assert.strictEqual(typeof createSessionGuard, "function");
  });
});
