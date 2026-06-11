import { describe, it } from "node:test";
import assert from "node:assert";
import { createState } from "../../src/state.js";
import { buildTools, buildCommand } from "../../src/tools.js";

function createTestTools() {
  const state = createState("P");
  const ctx: Parameters<typeof buildTools>[0] = {
    state,
    sendMessage: async () => {},
  };
  const tools = buildTools(ctx);
  const command = buildCommand({ state, tools });
  return { state, tools, command };
}

describe("buildTools", () => {
  it("should return an array of tools", () => {
    const { tools } = createTestTools();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length >= 10);
  });

  it("should include prides_status tool", () => {
    const { tools } = createTestTools();
    const tool = tools.find(t => t.name === "prides_status");
    assert.ok(tool);
    assert.ok(tool.description);
    assert.ok(tool.execute);
  });

  it("should include prides_phase_advance tool", () => {
    const { tools } = createTestTools();
    assert.ok(tools.find(t => t.name === "prides_phase_advance"));
  });

  it("should include prides_emergency_stop tool", () => {
    const { tools } = createTestTools();
    assert.ok(tools.find(t => t.name === "prides_emergency_stop"));
  });
});

describe("prides_status tool", () => {
  it("should return current phase info", async () => {
    const { tools } = createTestTools();
    const tool = tools.find(t => t.name === "prides_status")!;
    const result = await tool.execute({});
    assert.strictEqual(result.phase, "P");
    assert.strictEqual(result.phaseName, "Prototype");
    assert.strictEqual(result.heartbeat.status, "critical");
    assert.strictEqual(result.gatesPassed, 0);
    assert.strictEqual(result.gatesTotal, 5);
  });
});

describe("prides_phase_advance tool", () => {
  it("should block advance when exit criteria not met", async () => {
    const { tools } = createTestTools();
    const tool = tools.find(t => t.name === "prides_phase_advance")!;
    const result = await tool.execute({ force: false });
    assert.strictEqual(result.blocked, true);
    assert.ok(result.message);
  });

  it("should advance when force=true", async () => {
    const { tools } = createTestTools();
    const tool = tools.find(t => t.name === "prides_phase_advance")!;
    const result = await tool.execute({ force: true });
    assert.strictEqual(result.advanced, true);
    assert.strictEqual(result.from, "P");
    assert.strictEqual(result.to, "R");
  });
});

describe("prides_emergency_stop tool", () => {
  it("should log critical incident", async () => {
    const { state, tools } = createTestTools();
    const tool = tools.find(t => t.name === "prides_emergency_stop")!;
    const result = await tool.execute({ reason: "test stop" });
    assert.strictEqual(result.emergency_stop, true);
    assert.strictEqual(result.reason, "test stop");
    assert.ok(state.state.incidents.length > 0);
    assert.strictEqual(state.state.incidents[0].severity, "critical");
  });
});

describe("buildCommand", () => {
  it("should return help text for unknown subcommand", async () => {
    const { command } = createTestTools();
    const result = await command.handler("unknown");
    assert.ok(result.includes("PRIDES commands"));
  });

  it("should handle 'status' subcommand", async () => {
    const { command } = createTestTools();
    const result = await command.handler("status");
    assert.ok(result.includes("Phase:"));
    assert.ok(result.includes("Heartbeat:"));
  });

  it("should handle 'scaffold' subcommand", async () => {
    const { command } = createTestTools();
    const result = await command.handler("scaffold");
    assert.ok(result.includes("Scaffolded"));
    assert.ok(result.includes("Directories:"));
  });

  it("should catch errors gracefully", async () => {
    const state = createState("P");
    const brokenTools = [{ name: "prides_status", execute: async () => { throw new Error("boom"); } }] as unknown as Parameters<typeof buildCommand>[0]["tools"];
    const command = buildCommand({ state, tools: brokenTools });
    const result = await command.handler("status");
    assert.ok(result.includes("Error:"));
    assert.ok(result.includes("boom"));
  });
});
