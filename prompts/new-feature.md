---
description: Start developing a new feature - runs through the full PRIDES workflow
---

# New Feature: $ARGUMENTS

## Workflow

Run the complete PRIDES workflow for developing a new feature:

### 1. Prototype Phase
Document the feature concept:
```
prides_task_add description="Prototype: $ARGUMENTS"
```

Create a brief design document or PRD in `dev_notes/`.

### 2. Review Phase
Get the design reviewed:
```
prides_phase_advance
```

Run review gates:
```
prides_gates
```

The `review` gate is manual — request human sign-off:
```
prides_gate review --approve
```

### 3. Implement Phase
Advance to implementation:
```
prides_phase_advance
```

Create implementation tasks:
```
prides_task_add description="Implement: [specific component]"
```

Build and test iteratively:
```
prides_gate test-unit
prides_gate linter
```

Mark tasks complete as you go:
```
prides_task_done id=[task-id]
```

### 4. Deploy Phase
All Implement-phase tasks must be 100% complete before advancing to Deploy.

Advance and run deploy checks:
```
prides_phase_advance
prides_gates
```

### 5. Extend Phase (if needed)
Plan future improvements:
```
prides_task_add description="Extend: [improvement]"
```

### 6. Secure Phase
Run security audit:
```
prides_phase_advance
prides_gates
```

### 7. Log Completion
```
prides_artifact kind=feature-complete path=dev_notes/feature-[name].md
```
