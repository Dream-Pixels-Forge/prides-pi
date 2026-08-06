---
description: Run end-to-end tests
agent: prides
subtask: true
---

# Test E2E

## Testing Workflow

### 1. Run Tests
Execute end-to-end tests:
```
npm run test:e2e
```
or equivalent command for your framework.

### 2. Analysis
If tests fail, invoke `@implement-debugger` to analyze failures.

### 3. Fix Issues
Delegate to `@implement-coder` to fix any test failures.

### 4. Re-run
Run tests again to verify fixes.

### 5. Report
Provide test results summary:
- Tests passed/failed
- Duration
- Any flaky tests identified

Update `docs/TESTING.md` if needed.
