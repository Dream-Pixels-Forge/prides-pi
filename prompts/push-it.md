---
description: Commit and push changes to repository
---

# Push It - Commit and Push Workflow

## Git Workflow

### 1. Check Status
Review current git status:
```
prides_git_status
```

### 2. Review Changes
Check what's staged and unstaged:
```
git status
git diff --staged
git diff
```

### 3. Stage Changes
Stage all relevant changes:
```
git add -A
```

Or stage specific files:
```
git add [file1] [file2]
```

### 4. Commit
Create a meaningful commit:
```
git commit -m "type: description of changes"
```

Commit message types:
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring
- `test:` adding tests
- `chore:` maintenance

### 5. Push
Push to remote:
```
git push
```

### 6. Record in PRIDES
If on a feature branch, record the push:
```
prides_git_step step="code"
```
