# Implementation Plan: Obsidian Knowledge Improvements

## Context
Based on knowledge from the Obsidian vault (forge brain), implement 5 improvements to prides-pi.

## 1. Replace checkGate() stub with judge pattern (HIGH)

### Current State
In `src/tools.ts` line 350-353:
```typescript
function checkGate(gateId: string): boolean {
  // Default: all gates pass. Override via a real gate evaluator.
  return true;
}
```
This is a stub that always returns true. It needs to be replaced with a real gate evaluator.

### Design
Create a `GateEvaluator` interface that can be extended with real evaluations:

```typescript
// In src/gates.ts - add after validateGate

export type GateEvaluator = (gateId: string, context: GateContext) => GateResult;

export interface GateContext {
  currentPhase: Phase;
  gateResults: Record<string, boolean>;
  artifacts: { phase: Phase; name: string; hash?: string }[];
  incidents: { ts: number; phase: Phase; severity: string; detail: string }[];
}

export interface GateResult {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

// Default evaluator that checks based on artifacts and incidents
export function createDefaultGateEvaluator(): GateEvaluator {
  return (gateId, context) => {
    // Gate-specific logic
    switch (gateId) {
      case "code-review":
        // Check if code-review artifact exists
        return {
          passed: context.artifacts.some(a => a.name.includes("code-review")),
          reason: context.artifacts.some(a => a.name.includes("code-review")) 
            ? undefined 
            : "No code-review artifact found"
        };
      case "test-coverage":
        return {
          passed: context.artifacts.some(a => a.name.includes("test-coverage")),
          reason: context.artifacts.some(a => a.name.includes("test-coverage"))
            ? undefined
            : "No test-coverage artifact found"
        };
      case "security":
        return {
          passed: !context.incidents.some(i => i.severity === "critical" && i.detail.includes("security")),
          reason: context.incidents.some(i => i.severity === "critical" && i.detail.includes("security"))
            ? "Critical security incident found"
            : undefined
        };
      case "performance":
        return {
          passed: context.artifacts.some(a => a.name.includes("performance")),
          reason: context.artifacts.some(a => a.name.includes("performance"))
            ? undefined
            : "No performance benchmark artifact found"
        };
      case "accessibility":
        return {
          passed: context.artifacts.some(a => a.name.includes("accessibility")),
          reason: context.artifacts.some(a => a.name.includes("accessibility"))
            ? undefined
            : "No accessibility audit artifact found"
        };
      default:
        return { passed: true };
    }
  };
}
```

### Changes Required
1. Add `GateEvaluator`, `GateContext`, `GateResult` types to `src/gates.ts`
2. Add `createDefaultGateEvaluator()` function to `src/gates.ts`
3. Update `StateManager` interface to include `gateEvaluator: GateEvaluator`
4. Update `createState()` to accept optional `GateEvaluator` parameter
5. Update `setGateResult` to use evaluator when available
6. Update `buildGateTool` and `buildGatesTool` to use evaluator
7. Add tests for the evaluator

---

## 2. Add task_plan.md tracking per phase (HIGH)

### Design
Add a `TaskPlan` interface and methods to `StateManager` that tracks phase progress with checkboxes.

### Changes Required
1. Add `TaskPlan` interface to `src/state.ts`:
```typescript
export interface TaskPlan {
  phase: Phase;
  tasks: { id: string; description: string; done: boolean; completedAt?: string }[];
  createdAt: string;
  updatedAt: string;
}
```

2. Add methods to `StateManager`:
- `getTaskPlan(): TaskPlan | null`
- `setTaskPlan(plan: TaskPlan): void`
- `addTask(description: string): string` (returns task ID)
- `completeTask(taskId: string): boolean`
- `getPhaseProgress(): { total: number; completed: number; percentage: number }`

3. Update `toJSON()`/`fromJSON()` to persist task plan

4. Add to `PRIDESState`:
```typescript
taskPlan: TaskPlan | null;
```

5. Add tests for task plan functionality

---

## 3. Event-sourced state (MEDIUM)

### Design
Instead of mutating state directly, append events and derive state from them.

### Changes Required
1. Add `Event` interface to `src/state.ts`:
```typescript
export interface PRIDSEvent {
  id: string;
  type: "phase_changed" | "gate_result" | "heartbeat" | "incident" | "artifact" | "task_updated";
  timestamp: string;
  payload: Record<string, unknown>;
}
```

2. Add event log to state:
```typescript
events: PRIDSEvent[];
```

3. Add methods:
- `appendEvent(type, payload): PRIDSEvent`
- `getEvents(filter?: { type?: string; since?: string }): PRIDSEvent[]`
- `replayEvents(): PRIDESState` (derive state from events)

4. Keep existing methods for backward compatibility but have them append events internally

5. Add tests for event sourcing

---

## 4. Tighten tool descriptions (MEDIUM)

### Changes Required
Review and improve all tool descriptions in `src/tools.ts` to be more precise about:
- When the tool should be used
- What inputs are expected
- What outputs are returned
- Error conditions

Specific improvements:
- `prides_status`: Add "Call at session start and after every phase transition"
- `prides_phase_advance`: Add "Requires all exit criteria to be met unless force=true"
- `prides_gate`: Add "Run after code changes to validate quality"
- `prides_heartbeat`: Add "Call every heartbeatMs interval to track agent health"
- `prides_emergency_stop`: Add "Use only when agent behavior is unsafe or unexpected"

---

## 5. Document skills vs commands (LOW)

### Changes Required
Add a section to README.md explaining:
- Commands: `/prides status`, `/prides next`, etc. (manual invocation)
- Skills: Tool guard, session guard (auto-invoked on events)
- When to use each

---

## Implementation Order
1. First: Gate evaluator (foundational, other features depend on it)
2. Second: Task plan tracking (builds on state)
3. Third: Event sourcing (refactors state, must be careful)
4. Fourth: Tool descriptions (cosmetic, quick)
5. Fifth: Documentation (最后)

## Testing
After each change, run `npm test` to verify all 75 tests still pass.
After all changes, rebuild bundle with `npx tsx scripts/bundle.ts`.
