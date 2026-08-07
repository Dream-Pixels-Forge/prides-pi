---
description: Run a comprehensive security audit
---

# Security Audit

## Security Audit Workflow

### 1. Security Scan
Run the security gate:
```
prides_gate security
```

Or use the comprehensive security skill:
```
Read and follow skills/prides-cybersec/SKILL.md
```

### 2. Vulnerability Categories
Check for common security issues:
- **Input validation**: SQL injection, XSS, command injection
- **Authentication**: Weak passwords, missing MFA, session fixation
- **Authorization**: Broken access control, privilege escalation
- **Data protection**: Sensitive data exposure, missing encryption
- **Configuration**: Default credentials, debug mode in production
- **Dependencies**: Known CVEs in third-party packages

### 3. Create Remediation Tasks
For each finding:
```
prides_task_add description="Fix security: [vulnerability description]"
```

### 4. Apply Fixes
Common remediations:
- Use parameterized queries (prevent SQL injection)
- Sanitize and encode output (prevent XSS)
- Implement proper authentication headers
- Add CSRF protection
- Use HTTPS everywhere
- Rotate exposed secrets immediately

### 5. Emergency Response
If a critical vulnerability is found that is actively exploitable:
```
prides_emergency_stop reason="Critical security vulnerability: [description]"
```

### 6. Verify Fixes
Re-run security checks:
```
prides_gate security
```

### 7. Log Audit
```
prides_artifact kind=security-audit path=dev_notes/security-audit.md
```
