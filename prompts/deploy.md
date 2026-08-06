---
description: Deploy application to specified environment
agent: prides
subtask: true
---

# Deploy: $ARGUMENTS

## Deployment Workflow

### 1. Pre-deployment Check
Invoke `@review-inspector` to ensure code is clean.
Invoke `@implement-linter` to verify code quality.

### 2. Security Check
Invoke `@secure-agent` to perform pre-deployment security scan.

### 3. Performance Check  
Invoke `@deploy-performance` to verify performance is acceptable.

### 4. Deployment
Invoke `@deploy-agent` to:
- Deploy to environment: $ARGUMENTS (or 'staging' if not specified)
- Configure CI/CD pipeline
- Set up environment variables
- Run database migrations if needed

### 5. Post-deployment
- Verify deployment success
- Run smoke tests
- Check application health

### 6. Documentation
Update:
- `docs/CHANGELOG.md` - Document deployment
- `docs/DEPLOYMENT.md` - Update deployment docs
- Version tags in git

Provide deployment summary with status and any issues encountered.
