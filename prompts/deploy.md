---
description: Deploy application to specified environment
---

# Deploy: $ARGUMENTS

## Deployment Workflow

### 1. Pre-deployment Verification
Ensure all quality gates pass:
```
prides_gates
```

Fix any failing gates before proceeding.

### 2. Security Check
Run the security gate:
```
prides_gate security
```

### 3. Performance Check
Run performance verification:
```
prides_gate performance
```

### 4. Build
Create a production build:
```
npm run build
```

### 5. Deploy
Execute deployment:
```
npm run deploy
```

Or use the deploy skill:
```
Read and follow skills/prides-deploy/SKILL.md
```

### 6. Post-deployment Verification
- Verify the application is accessible
- Check health endpoints
- Monitor error rates

### 7. Log Deployment
```
prides_artifact kind=deploy path=dev_notes/deploy-[date].md
```
