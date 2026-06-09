import { describe, it } from "node:test";
import assert from "node:assert";
import { createToolGuard, createSessionGuard } from "../../src/guards.js";

describe("Tool Guard", () => {
  it("should allow non-blocked tools", () => {
    const guard = createToolGuard("P", ["write", "edit"]);
    assert.strictEqual(guard.check("read").blocked, false);
    assert.strictEqual(guard.check("bash").blocked, false);
  });

  it("should block write in Review phase", () => {
    const guard = createToolGuard("R", ["write", "edit"]);
    const result = guard.check("write");
    assert.strictEqual(result.blocked, true);
    assert.ok(result.reason?.includes("blocked"));
  });

  it("should block edit in Review phase", () => {
    const guard = createToolGuard("R", ["write", "edit"]);
    const result = guard.check("edit");
    assert.strictEqual(result.blocked, true);
  });

  it("should allow write in Prototype phase", () => {
    const guard = createToolGuard("P", []);
    assert.strictEqual(guard.check("write").blocked, false);
  });

  it("should include phase name in reason", () => {
    const guard = createToolGuard("D", ["write"]);
    const result = guard.check("write");
    assert.ok(result.reason?.includes("D"));
    assert.ok(result.reason?.includes("Deploy"));
  });

  it("should update guard when phase changes", () => {
    const guard = createToolGuard("P", []);
    assert.strictEqual(guard.check("write").blocked, false);
    guard.update("R", ["write", "edit"]);
    assert.strictEqual(guard.check("write").blocked, true);
    assert.ok(guard.check("write").reason?.includes("Review"));
  });

  it("should validate gate IDs", () => {
    const guard = createToolGuard("P", []);
    // Valid gates should work
    assert.strictEqual(guard.check("write").blocked, false);
  });
});

describe("Session Guard", () => {
  it("should allow session switch when no gates are failing", () => {
    const guard = createSessionGuard("P", {}, "high");
    assert.strictEqual(guard.check().blocked, false);
  });

  it("should block session switch when critical phase has failing gates", () => {
    const gateResults = { "code-review": false, "test-coverage": false };
    const guard = createSessionGuard("I", gateResults, "critical");
    const result = guard.check();
    assert.strictEqual(result.blocked, true);
    assert.ok(result.reason?.includes("critical"));
  });

  it("should allow session switch in non-critical phase with failing gates", () => {
    const gateResults = { "code-review": false };
    const guard = createSessionGuard("E", gateResults, "medium");
    assert.strictEqual(guard.check().blocked, false);
  });

  it("should allow session switch in critical phase with all gates passing", () => {
    const gateResults = { "code-review": true, "test-coverage": true, "security": true, "performance": true, "accessibility": true };
    const guard = createSessionGuard("I", gateResults, "critical");
    assert.strictEqual(guard.check().blocked, false);
  });

  it("should update guard when phase changes", () => {
    const guard = createSessionGuard("P", {}, "high");
    assert.strictEqual(guard.check().blocked, false);
    guard.update("I", "critical", { "code-review": true, "test-coverage": true, "security": true, "performance": true, "accessibility": true });
    assert.strictEqual(guard.check().blocked, false);
  });
});