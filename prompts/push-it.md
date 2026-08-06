---
description: Commit and push changes to repository
agent: prides
subtask: true
---

# Push It - Commit and Push Workflow

## Git Workflow

### 1. Check Status
Invoke `@review-git-expert` to:
- Check current git status
- Review staged changes
- Verify branch state

### 2. Review Changes
Show the diff of staged changes:
```
git diff --staged
```

### 3. Review Changes
Invoke `@review-critic` to review the changes before commit.

### 4. Stage Changes
Stage files as needed:
```
git add <files>
```

### 5. Commit
Create a meaningful commit message following conventional commits:
- `feat: add new authentication`
- `fix: resolve login issue`
- `docs: update README`
- `refactor: simplify user service`
- `test: add unit tests for auth`

### 6. Push
Push to remote:
```
git push
```

If it's a new branch, push with upstream:
```
git push -u origin <branch-name>
```

### 7. Documentation
Update `docs/CHANGELOG.md` with the commit changes if not already done.

Provide commit summary including:
- Branch name
- Commit message
- Files changed
- Any issues encountered
