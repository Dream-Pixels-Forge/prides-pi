---
description: Fix a bug - run through bug identification and resolution workflow
---

# Bug Fix: $ARGUMENTS

## Bug Fix Workflow

### 1. Investigation
- Identify and understand the bug: $ARGUMENTS
- Find the root cause
- Locate relevant code

### 2. Analysis
- Document the bug description and impact
- Perform root cause analysis
- Identify affected components

### 3. Create Task
```
prides_task_add description="Fix bug: $ARGUMENTS"
```

### 4. Implement Fix
- Write a minimal fix that addresses the root cause
- Follow existing code patterns
- Add defensive checks where appropriate

### 5. Test the Fix
- Write a regression test that reproduces the bug
- Verify the fix passes:
```
prides_gate test-unit
```

### 6. Mark Complete
```
prides_task_done id=[task-id]
```

### 7. Log the Fix
```
prides_artifact kind=bugfix path=dev_notes/bugfix-[description].md
```
