---
description: Refactor code - improve code quality and structure
agent: prides
subtask: true
---

# Refactor: $ARGUMENTS

## Refactor Workflow

### 1. Analysis
Invoke `@review-inspector` to analyze:
- Code to refactor: $ARGUMENTS
- Current issues and tech debt
- Improvement opportunities

### 2. Planning
Invoke `@prototype-plan` to:
- Plan refactoring approach
- Identify dependencies
- Estimate impact

### 3. Architecture Review
If significant, invoke `@extend-architect` to:
- Review current architecture
- Suggest improvements
- Ensure scalability

### 4. Implementation
Delegate to `@implement-coder` to:
- Perform refactoring
- Maintain functionality
- Add tests

### 5. Quality Check
Run through:
- `@implement-linter` - Code style
- `@review-inspector` - Verify quality
- `@review-critic` - Final review

### 6. Documentation
Update:
- `docs/CHANGELOG.md` - Document refactoring
- Code comments where needed
- Architecture docs if changed

Provide refactoring summary including changes made and improvements achieved.
