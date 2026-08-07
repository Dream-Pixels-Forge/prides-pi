---
description: Create a quick prototype for idea validation
---

# Prototype: $ARGUMENTS

## Quick Prototype Workflow

### 1. Ideation
Brainstorm approaches for: $ARGUMENTS

### 2. Analysis
Evaluate feasibility and identify the minimal viable approach.

### 3. Create Task
```
prides_task_add description="Prototype: $ARGUMENTS"
```

### 4. Rapid Build
Build a quick prototype:
- Focus on core functionality only
- Skip tests and polish for now
- Use existing patterns and components
- Hardcode or stub external dependencies

### 5. Validate
Test the prototype works:
- Does it demonstrate the core concept?
- Are there fundamental blockers?
- What are the key learnings?

### 6. Document
Record prototype results:
```
prides_artifact kind=prototype path=dev_notes/prototype-[name].md
```

### 7. Mark Complete
```
prides_task_done id=[task-id]
```

### 8. Decide Next Steps
Based on prototype results:
- If viable → move to full implementation
- If not → document learnings and pivot
- If partial → refine approach and re-prototype
