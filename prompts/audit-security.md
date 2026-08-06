---
description: Run a comprehensive security audit
agent: prides
subtask: true
---

# Security Audit

## Security Audit Workflow

### 1. Security Scan
Invoke `@secure-agent` to:
- Perform comprehensive security audit
- Identify vulnerabilities
- Check for common security issues:
  - Input validation
  - Authentication/authorization
  - Data protection
  - SQL injection
  - XSS vulnerabilities
  - CSRF protection
  - Secure headers

### 2. Architecture Review
Invoke `@secure-architect` to:
- Review security architecture
- Check defense-in-depth strategies
- Evaluate security patterns

### 3. Dependency Check
Invoke `@review-inspector` to check dependencies for known vulnerabilities.

### 4. Configuration Audit
Review:
- Environment variables handling
- API keys and secrets
- CORS policies
- Security headers

## Output

Provide security audit report with:
- Critical vulnerabilities (immediate action)
- High vulnerabilities (soon)
- Medium/Low vulnerabilities (plan to fix)
- Recommendations

Update `docs/SECURITY.md` with audit findings and create remediation plan.
