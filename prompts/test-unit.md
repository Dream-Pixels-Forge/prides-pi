---
description: Run unit tests
---

# Test Unit

## Unit Testing Workflow

### 1. Run Tests
Execute unit tests:
```
npm run test
npm run test:unit
```

Or use the PRIDES gate:
```
prides_gate test-unit
```

### 2. Coverage Check
Check test coverage:
```
npm run test:coverage
```

### 3. Analysis
If tests fail:
- Read the error output carefully
- Identify the failing test and assertion
- Locate the root cause in the code
- Create a fix task:
```
prides_task_add description="Fix unit test: [test name]"
```

### 4. Fix and Re-run
After fixing:
```
prides_gate test-unit
```

### 5. Add Missing Tests
For untested code paths:
```
prides_task_add description="Add test: [component/behavior]"
```

### 6. Document
Record test results:
```
prides_artifact kind=unit-results path=dev_notes/unit-results-[date].md
```
