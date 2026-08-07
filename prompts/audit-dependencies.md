---
description: Audit project dependencies for vulnerabilities and updates
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
Run the security audit gate:
```
prides_gate dependencies
```

Or manually:
```
npm audit --omit=dev
```

### 3. Update Recommendations
- Identify outdated packages
- Check for breaking changes in major version bumps
- Review changelogs for security fixes
- Prioritize critical/high severity vulnerabilities

### 4. Apply Updates
Update dependencies carefully:
```
npm update
```

For major version bumps, review migration guides first.

### 5. Verification
Re-run tests to ensure updates don't break anything:
```
prides_gate test-unit
```

### 6. Log Results
Record findings as an artifact:
```
prides_artifact kind=dependency-audit path=dev_notes/dependency-audit.md
```
