---
description: Plan architecture improvements and scalability
---

# Extend Architecture: $ARGUMENTS

## Architecture Planning Workflow

### 1. Current State Analysis
Analyze the current architecture:
- Review existing code structure
- Identify technical debt
- Assess scalability bottlenecks
- Document current component relationships

### 2. Create Tasks
For each improvement area:
```
prides_task_add description="Extend: [improvement description]"
```

### 3. Plan Implementation
- Design the target architecture
- Identify migration path from current to target
- Assess risk and breaking changes
- Plan incremental delivery

### 4. Implement Changes
Work through tasks systematically:
1. Create abstraction layers
2. Refactor modules for better separation of concerns
3. Add caching and performance optimizations
4. Implement new features or capabilities

### 5. Test Architecture Changes
Run all quality gates:
```
prides_gates
```

### 6. Document
Record architecture decisions:
```
prides_artifact kind=architecture-decision path=dev_notes/arch-decision-[topic].md
```
