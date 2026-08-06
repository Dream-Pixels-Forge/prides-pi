---
description: Audit functionality and replace mockups with real implementations - ensures fully functional buttons, links, code, and features
agent: prides
subtask: true
---

# Functionality Audit: $ARGUMENTS

## Audit & Implementation Workflow

### 1. Discovery & Analysis
First, perform a comprehensive audit of the current implementation:
- Scan all UI components for buttons, links, and interactive elements
- Identify mockups, placeholders, TODOs, and stub implementations
- Check for non-functional or incomplete features
- Map out all user interactions and flows

Invoke `@review-inspector` to:
- Analyze codebase for incomplete implementations
- Identify mock data, fake handlers, and placeholder functions
- Find broken or missing links
- Detect disabled or non-functional buttons

### 2. Critical Review
Invoke `@review-critic` to:
- Review the completeness of current functionality
- Identify gaps between design and implementation
- Assess code quality of existing implementations
- Prioritize what needs to be made functional

### 3. Implementation Planning
Invoke `@prototype-plan` to:
- Create a prioritized list of items to implement
- Estimate effort for each implementation
- Identify dependencies between features
- Plan the implementation order

### 4. Real Implementation
Delegate to `@implement-coder` to:
- **Replace all mockups** with real, working implementations
- **Make buttons fully functional** with proper event handlers
- **Implement working links** with correct routing/navigation
- **Replace stub functions** with complete logic
- **Add real data fetching** instead of mock data
- **Implement proper error handling** for all interactions
- **Add loading states** for async operations
- **Connect to actual APIs/services** where needed

### 5. UI/UX Validation
Invoke `@ui-ux-agent` to:
- Ensure all interactive elements have proper visual feedback
- Verify hover, active, focus, and disabled states
- Check accessibility of all interactive elements
- Validate user flow completeness

### 6. Quality Assurance
Run through:
- `@implement-linter` - Code quality and standards
- `@review-inspector` - Verify all items are now functional
- `@review-critic` - Final code review

### 7. Testing
Invoke `@test-agent` to:
- Create tests for newly implemented functionality
- Test all button clicks and interactions
- Verify link navigation works correctly
- Test edge cases and error scenarios

### 8. Security Check
Invoke `@secure-agent` to:
- Review all new implementations for security issues
- Check input validation on forms
- Verify proper authentication/authorization
- Ensure no exposed secrets or vulnerabilities

### 9. Documentation
Update:
- `docs/TASKS.md` - Mark functionality items as completed
- `docs/CHANGELOG.md` - Document new implementations
- `README.md` - Update feature list if needed
- Component documentation with working examples

## Output

Provide a comprehensive functionality audit report including:

### Audit Summary
- Total items audited
- Mockups found and replaced
- Buttons made functional
- Links implemented
- Features completed

### Implementation Details
- List of all components updated
- New functionality added
- APIs/services integrated
- Error handling implemented

### Verification Checklist
- [ ] All buttons have working click handlers
- [ ] All links navigate correctly
- [ ] No TODO/FIXME/HACK comments remain
- [ ] No placeholder/mock data in production code
- [ ] All forms submit and validate properly
- [ ] All interactive elements have proper states
- [ ] Error handling implemented everywhere
- [ ] Loading states implemented for async operations
- [ ] All tests passing
- [ ] Accessibility compliance verified

### Before/After Comparison
Show what was incomplete vs what is now fully functional.

Update `docs/PROGRESS.md` with completed implementations.
