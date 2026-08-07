---
description: Run a performance audit and optimization
---

# Performance Audit

## Performance Audit Workflow

### 1. Performance Analysis
Profile the application and identify bottlenecks:
- Load times (LCP, FCP, TTI)
- API response times
- Database query performance
- Memory usage
- CPU usage
- Bundle size

### 2. Establish Baselines
Record current metrics as a benchmark:
```
prides_artifact kind=performance-baseline path=dev_notes/performance-baseline.md
```

### 3. Identify Bottlenecks
Common performance killers:
- Unoptimized images (missing WebP, no lazy loading)
- Large bundle sizes (no code splitting)
- N+1 database queries
- Missing caching headers
- Synchronous heavy operations
- Excessive re-renders (React) or DOM manipulation

### 4. Create Optimization Tasks
For each bottleneck:
```
prides_task_add description="Optimize: [specific bottleneck]"
```

### 5. Implement Optimizations
Apply fixes and measure improvement for each:
- Image optimization (compress, WebP, lazy load)
- Code splitting and tree shaking
- Database query optimization
- Implement caching (browser, CDN, application)
- Move heavy work to background threads/workers

### 6. Verify Improvement
Run performance checks:
```
prides_gate performance
```

### 7. Log Results
```
prides_artifact kind=performance-audit path=dev_notes/performance-audit.md
```
