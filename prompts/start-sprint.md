---
description: Start a new sprint - initialize sprint tasks and planning
agent: prides
subtask: true
---

# Start Sprint: $ARGUMENTS

## Sprint Setup

### 1. Task Planning

Invoke `@implement-tasks` to:

- Create tasks for this sprint based on the goal: $ARGUMENTS
- Break down features into manageable tasks
- Set priorities and dependencies
- Update `dev_notes/TASKS.md` with the task breakdown
- Always update `dev_notes/TASKS.md` after each task completion
- Always use pnpm for package management

### 2. Documentation

Create or update:

- `dev_notes/SPRINT.md` - Sprint goals and timeline
- `dev_notes/TASKS.md` - Task breakdown with status
- `dev_notes/PROGRESS.md` - Sprint progress tracking

### 3. Repository Check

Invoke `@review-git-expert` to ensure repository is clean and ready for sprint work.

### 4. Codebase State

Invoke `@review-inspector` to understand current codebase state and any technical debt.

### 5. Architecture Review

If needed, invoke `@extend-architect` for any architectural considerations for this sprint.

## Sprint Workflow

For each task in this sprint:

1. Implement -> Linter -> Inspector -> Critic -> (fix if needed)
2. Update `dev_notes/TASKS.md` after each completion
3. Update `dev_notes/PROGRESS.md` at end of each day

Provide a sprint plan with task breakdown and estimated timeline.
