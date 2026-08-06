---
description: Run a performance audit and optimization
agent: prides
subtask: true
---

# Performance Audit

## Performance Audit Workflow

### 1. Performance Analysis
Invoke `@deploy-performance` to:
- Profile application performance
- Identify bottlenecks
- Analyze:
  - Load times
  - API response times
  - Database queries
  - Memory usage
  - CPU usage

### 2. Frontend Performance
Check:
- Bundle size
- Lazy loading
- Image optimization
- Caching strategies

### 3. Backend Performance
Analyze:
- Database queries (N+1 problems)
- API endpoints
- Caching implementation
- Resource usage

### 4. Scalability Assessment
Invoke `@extend-architect` to:
- Evaluate scalability
- Check capacity planning
- Review load balancing

## Output

Provide performance audit report with:
- Critical bottlenecks (fix immediately)
- Important optimizations (plan)
- Suggested improvements
- Performance metrics

Update `docs/PERFORMANCE.md` with findings and create optimization plan.
