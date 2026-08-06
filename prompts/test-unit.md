---
description: Run unit tests
agent: prides
subtask: true
---

# Test Unit

## Unit Testing Workflow

### 1. Run Tests
Execute unit tests:
```
npm run test
npm run test:unit
```
or equivalent command.

### 2. Coverage Check
Check test coverage:
```
npm run test:coverage
```

### 3. Analysis
If tests fail:
- Invoke `@implement-debugger` for failing tests
- Identify root causes

### 4. Fix Issues
Delegate to `@implement-coder` to fix failing tests.

### 5. Report
Provide test results:
- Tests passed/failed
- Coverage percentage
- Files needing more tests

Update `docs/TESTING.md` with coverage reports.
