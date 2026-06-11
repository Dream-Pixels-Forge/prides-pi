import { describe, it } from "node:test";
import assert from "node:assert";
import { GATES, validateGate, createDefaultGateEvaluator } from "../../src/gates.js";
import type { GateContext } from "../../src/gates.js";

// ── Unit tests for quality gates ─────────────────────────────────────────

describe("Quality Gates", () => {
  it("should have exactly 5 quality gates", () => {
    assert.strictEqual(GATES.length, 5);
  });

  it("should include code-review gate", () => {
    const gate = GATES.find(g => g.id === "code-review");
    assert.ok(gate);
    assert.strictEqual(gate.name, "Code Review");
  });

  it("should include test-coverage gate", () => {
    const gate = GATES.find(g => g.id === "test-coverage");
    assert.ok(gate);
    assert.strictEqual(gate.name, "Test Coverage");
  });

  it("should include security gate", () => {
    const gate = GATES.find(g => g.id === "security");
    assert.ok(gate);
    assert.strictEqual(gate.name, "Security Scan");
  });

  it("should include performance gate", () => {
    const gate = GATES.find(g => g.id === "performance");
    assert.ok(gate);
    assert.strictEqual(gate.name, "Performance");
  });

  it("should include accessibility gate", () => {
    const gate = GATES.find(g => g.id === "accessibility");
    assert.ok(gate);
    assert.strictEqual(gate.name, "Accessibility");
  });

  it("should validate known gate IDs", () => {
    const result = validateGate("code-review");
    assert.strictEqual(result.valid, true);
    assert.ok(result.gate);
    assert.strictEqual(result.gate.id, "code-review");
  });

  it("should reject unknown gate IDs", () => {
    const result = validateGate("unknown-gate");
    assert.strictEqual(result.valid, false);
    assert.ok(!result.gate);
  });

  it("should validate by partial name match", () => {
    const result = validateGate("security");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.gate.name, "Security Scan");
  });

  it("should be case-insensitive", () => {
    const result = validateGate("CODE-REVIEW");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.gate.id, "code-review");
  });
});

// ── Gate Evaluator tests ─────────────────────────────────────────────

function makeContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    currentPhase: "I",
    gateResults: {},
    artifacts: [],
    incidents: [],
    ...overrides,
  };
}

describe("Gate Evaluator", () => {
  it("should create a default evaluator", () => {
    const evaluator = createDefaultGateEvaluator();
    assert.strictEqual(typeof evaluator, "function");
  });

  it("should pass code-review when artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ artifacts: [{ phase: "I", name: "code-review-done" }] });
    const result = evaluator("code-review", ctx);
    assert.strictEqual(result.passed, true);
  });

  it("should fail code-review when no artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext();
    const result = evaluator("code-review", ctx);
    assert.strictEqual(result.passed, false);
    assert.ok(result.reason);
  });

  it("should pass test-coverage when artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ artifacts: [{ phase: "I", name: "test-coverage-report" }] });
    const result = evaluator("test-coverage", ctx);
    assert.strictEqual(result.passed, true);
  });

  it("should fail test-coverage when no artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext();
    const result = evaluator("test-coverage", ctx);
    assert.strictEqual(result.passed, false);
    assert.ok(result.reason);
  });

  it("should pass security when no critical security incident", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ incidents: [{ ts: 1, phase: "I", severity: "medium", detail: "minor issue" }] });
    const result = evaluator("security", ctx);
    assert.strictEqual(result.passed, true);
  });

  it("should fail security when critical security incident exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ incidents: [{ ts: 1, phase: "I", severity: "critical", detail: "security vulnerability found" }] });
    const result = evaluator("security", ctx);
    assert.strictEqual(result.passed, false);
    assert.ok(result.reason?.includes("security"));
  });

  it("should pass performance when artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ artifacts: [{ phase: "I", name: "performance-benchmark" }] });
    const result = evaluator("performance", ctx);
    assert.strictEqual(result.passed, true);
  });

  it("should fail performance when no artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext();
    const result = evaluator("performance", ctx);
    assert.strictEqual(result.passed, false);
  });

  it("should pass accessibility when artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext({ artifacts: [{ phase: "I", name: "accessibility-audit" }] });
    const result = evaluator("accessibility", ctx);
    assert.strictEqual(result.passed, true);
  });

  it("should fail accessibility when no artifact exists", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext();
    const result = evaluator("accessibility", ctx);
    assert.strictEqual(result.passed, false);
  });

  it("should pass unknown gates by default", () => {
    const evaluator = createDefaultGateEvaluator();
    const ctx = makeContext();
    const result = evaluator("unknown-gate", ctx);
    assert.strictEqual(result.passed, true);
  });
});
