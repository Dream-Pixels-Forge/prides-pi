---
description: Run a comprehensive code review
agent: prides
subtask: true
---

# Code Review

## Review Workflow

### 1. Code Inspection
Invoke `@review-inspector` to:
- Perform thorough code inspection
- Identify bugs, code smells, and issues
- Check for best practices violations

### 2. Critical Analysis
Invoke `@review-critic` to:
- Provide critical analysis of code quality
- Review architecture decisions
- Suggest improvements

### 3. Git Review
Invoke `@review-git-expert` to:
- Check recent commits and changes
- Review branch strategy
- Ensure clean commit history

### 4. Security Check
Invoke `@secure-agent` to:
- Check for security vulnerabilities
- Review authentication/authorization
- Identify security risks

### 5. Documentation Review
Check that documentation is up to date in:
- README.md
- API.md
- Architecture docs

## Output

Provide a comprehensive review report with:
- Critical issues (must fix)
- Important issues (should fix)
- Suggestions (could improve)
- Security concerns

Update `docs/PROGRESS.md` with review findings.
