---
description: Run end-to-end tests
---

# Test E2E

## Testing Workflow

### 1. Run Tests
Execute end-to-end tests:
```
npm run test:e2e
```

Or use the PRIDES gate:
```
prides_gate test-e2e
```

### 2. Analysis
If tests fail:
- Read the error output carefully
- Identify the failing test and assertion
- Locate the root cause
- Create a fix task:
```
prides_task_add description="Fix E2E test: [test name]"
```

### 3. Fix and Re-run
After fixing:
```
prides_gate test-e2e
```

### 4. Coverage Check
Review test coverage for gaps:
- Are critical user flows covered?
- Are edge cases tested?
- Is error handling verified?

### 5. Document
Record test results:
```
prides_artifact kind=e2e-results path=dev_notes/e2e-results-[date].md
```
