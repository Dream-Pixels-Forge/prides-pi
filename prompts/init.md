---
description: Initialize a new project with PRIDES best practices
agent: prides
subtask: true
---

# Init Project

## Project Initialization Workflow

**ALWAYS use this skill `karpathy-guidelines` in order to work accurately and efficiently**

### 1. Project Exploration

Determine the project if the current project is:

- Empty new project
- Existing project

### 2. Requirements

A. Empty new project: First, gather requirements:

- Project name and purpose
- Technology stack
- Key features
- Target users

B. Existing project: Analyze existing codebase and documentation deeply understand the project before proceeding

### 3. Documentation

A. Empty new project: Create initial documentation:

- `README.md` - Project overview
- `PRIDES.md` - PRIDES methodology guidelines
- `dev_notes/TASKS.md` - Task tracking
- `dev_notes/PROGRESS.md` - Progress tracking
- `dev_notes/CHANGELOG.md` - Change log
- `dev_notes/ARCHITECTURE.md` - Initial architecture

B. Existing project: Update documentation to reflect current state

### 4. Repository Setup

A. Empty new project: Invoke `@review-git-expert` to:

- Initialize git repository
- Create initial branch structure (features, devs, main or master)
- Set up .gitignore
- Create initial commit and push to remote repository, `github.com/Dream-Pixels-Forge/{project_name}`

B. Existing project: ask user to make sure repository is properly configured and up to date

### 5. Planning

A.1. Empty new project: Invoke `@prototype-idea` to brainstorm initial ideas and features.
A.2. Empty new project: Invoke `@prototype-plan` to create initial project plan.

B. Existing project: ask user to review existing plans and tasks, update as needed

### 6. Security Setup

A. Empty new project: Invoke `@secure-architect` for initial security architecture.

B. Existing project: ask user to review existing security measures and update as needed

### 7. Deployment Setup

A.1. Empty new project: Invoke `@deploy-agent` to set up initial CI/CD.

B. Existing project: ask user to review existing deployment setup and update as needed

Provide project initialization project workflow with prides coordination and project management next steps.
