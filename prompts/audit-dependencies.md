---
description: Audit project dependencies for vulnerabilities and updates
agent: prides
subtask: true
---

# Dependencies Audit

## Dependencies Audit Workflow

### 1. Inventory Check
Run the following to check dependencies:
```
npm list --depth=0
```
or for other package managers:
```
pip freeze
cargo tree
composer show
```

### 2. Vulnerability Scan
Run security audits:
```
npm audit
npm audit fix
```
or equivalent for your package manager.

### 3. Outdated Packages
Check for outdated packages:
```
npm outdated
```

### 4. Analysis
Invoke `@review-inspector` to:
- Analyze dependency tree
- Identify unnecessary dependencies
- Check for version conflicts

### 5. Recommendations
Based on findings, recommend:
- Packages to update
- Packages to remove
- Packages to replace
- Security patches needed

## Output

Provide dependencies audit report with:
- Known vulnerabilities (critical first)
- Outdated packages
- Unused dependencies
- Recommended actions

Update `docs/DEPENDENCIES.md` with audit findings.
