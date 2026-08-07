---
description: Initialize a new project with PRIDES best practices
---

# Init Project

## Project Initialization Workflow

### 1. Project Exploration

Determine the project state:
- Empty new project
- Existing project

### 2. Requirements

Gather requirements:
- Project name and purpose
- Technology stack
- Repository URL (if existing)

### 3. Scaffold PRIDES Structure
```
prides_scaffold name="[project-name]" purpose="[one-line purpose]" stack="[tech stack]"
```

This creates:
- `.prides/intent.json` — project intent and configuration
- `.prides/gates.config.json` — quality gate definitions
- `dev_notes/TASKS.md` — task tracking
- `dev_notes/PROGRESS.md` — progress log
- `dev_notes/CHANGELOG.md` — change history
- `dev_notes/ARCHITECTURE.md` — architecture documentation
- `PRIDES.md` — PRIDES methodology reference

### 4. Verify Initialization
```
prides_status
```

### 5. Configure Gates
Edit `.prides/gates.config.json` to customize quality gates for your project.

### 6. Start First Phase
You are now in Phase P (Prototype). Begin by documenting your prototype goals:
```
prides_task_add description="[first prototype task]"
```
