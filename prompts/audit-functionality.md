---
description: Audit functionality and replace mockups with real implementations
---

# Functionality Audit: $ARGUMENTS

## Audit & Implementation Workflow

### 1. Discovery & Analysis
Perform a comprehensive audit of the current implementation:
- Scan all UI components for buttons, links, and interactive elements
- Identify mockups, placeholders, TODOs, and stub implementations
- Check for non-functional or incomplete features
- Map out all user interactions and flows

### 2. Catalog Issues
Create a task for each incomplete item:
```
prides_task_add description="Replace mockup: [component name]"
```

### 3. Implement Fixes
For each identified issue:
1. Replace mock data with real API calls
2. Implement actual handlers for interactive elements
3. Connect frontend to backend services
4. Remove TODO comments and placeholder code

### 4. Test Each Fix
After implementing each item, verify it works:
```
prides_gate test-unit
```

### 5. Mark Complete
When a fix is verified, mark its task done:
```
prides_task_done id=[task-id]
```

### 6. Report
Log the audit results:
```
prides_artifact kind=functionality-audit path=dev_notes/functionality-audit.md
```
