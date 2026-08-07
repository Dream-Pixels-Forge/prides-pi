---
description: Start a new sprint - initialize sprint tasks and planning
---

# Start Sprint: $ARGUMENTS

## Sprint Setup

### 1. Task Planning

Create tasks for this sprint based on the goal: $ARGUMENTS

Break down features into manageable tasks:
```
prides_task_add description="[task 1]"
prides_task_add description="[task 2]"
prides_task_add description="[task 3]"
```

### 2. Prioritize
- Identify critical path tasks
- Sequence tasks by dependency
- Estimate effort for each task

### 3. Update Documentation
Update `dev_notes/TASKS.md` with the task breakdown.

### 4. Set Sprint Goal
Document the sprint goal in `dev_notes/PROGRESS.md`.

### 5. Begin Work
Start with the highest priority task:
```
prides_task_list
```

### 6. Track Progress
As you complete tasks:
```
prides_task_done id=[task-id]
```

Record progress:
```
prides_heartbeat intent="working on [current task]"
```
