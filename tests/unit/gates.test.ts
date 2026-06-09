import { describe, it } from "node:test";
import assert from "node:assert";
import { GATES, validateGate } from "../../src/gates.js";

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
