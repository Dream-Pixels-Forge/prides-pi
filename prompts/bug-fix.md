---
description: Fix a bug - run through bug identification and resolution workflow
agent: prides
subtask: true
---

# Bug Fix: $ARGUMENTS

## Bug Fix Workflow

### 1. Investigation
Invoke `@implement-debugger` to:
- Identify and understand the bug: $ARGUMENTS
- Find the root cause
- Locate relevant code

### 2. Analysis
Have the debugger provide:
- Bug description and impact
- Root cause analysis
- Affected files and components

### 3. Fix Implementation
Delegate to `@implement-coder` to implement the fix.

### 4. Quality Check
Run through:
- `@implement-linter` - Code quality
- `@review-inspector` - Additional issues
- `@review-critic` - Code review

### 5. Security Check
If the bug has security implications, invoke `@secure-agent`.

### 6. Documentation
Update:
- `docs/TASKS.md` - Mark bug fix as completed
- `docs/CHANGELOG.md` - Document the fix
- Add test case to prevent regression

Provide the bug fix summary including root cause, solution, and any test cases added.
