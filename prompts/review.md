---
description: Run a comprehensive code review
---

# Code Review

## Review Workflow

### 1. Code Inspection
Perform thorough code inspection:
- Check for bugs and code smells
- Verify best practices compliance
- Review error handling
- Assess code readability and maintainability

### 2. Critical Analysis
Provide critical analysis:
- Review architecture decisions
- Identify potential performance issues
- Check security implications
- Assess test coverage

### 3. Run Review Gates
```
prides_gates
```

### 4. Manual Review Gate
The `review` gate requires human sign-off:
```
prides_gate review --approve
```

### 5. Document Findings
Record review results:
```
prides_artifact kind=review-notes path=dev_notes/review-[date].md
```

### 6. Create Follow-up Tasks
For any issues found:
```
prides_task_add description="Address review: [issue description]"
```
