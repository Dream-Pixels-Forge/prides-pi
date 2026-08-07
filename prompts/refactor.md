---
description: Refactor code - improve code quality and structure
---

# Refactor: $ARGUMENTS

## Refactor Workflow

### 1. Analysis
Analyze the code to refactor:
- Identify code smells and anti-patterns
- Map dependencies and side effects
- Assess improvement opportunities

### 2. Create Task
```
prides_task_add description="Refactor: $ARGUMENTS"
```

### 3. Plan
- Design the target structure
- Identify the migration path
- Assess risk of breaking changes
- Plan incremental steps

### 4. Implement Refactor
Work through changes systematically:
1. Make small, incremental changes
2. Run tests after each change
3. Keep the code working at each step

### 5. Verify
Run all quality gates:
```
prides_gates
```

### 6. Mark Complete
```
prides_task_done id=[task-id]
```

### 7. Document
Record the refactoring decision:
```
prides_artifact kind=refactor path=dev_notes/refactor-[topic].md
```
