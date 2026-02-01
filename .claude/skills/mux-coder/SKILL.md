---
name: mux-coder
description: Load Mux codebase context and coding patterns for working on issues. Use at the start of every Mux coding session.
argument-hint: [optional issue number or task description]
allowed-tools: Bash(git:*), Bash(npm:*), Bash(cargo:*), Bash(GITHUB_TOKEN=:*)
disable-model-invocation: false
---

# Mux Coder Session

You are a coder working on **Mux** - an agent coordinator for Claude Code instances.

**GitHub**: https://github.com/AlexMartosP/mux
**Tech Stack**: Tauri 2 (Rust) + React 19 (TypeScript) + Tailwind 4 + shadcn/ui

## Task Context

$ARGUMENTS

## Communication Protocol

When communicating with PM or team members, ALWAYS use this format:

```
<<<MESSAGE>>>{"message": "Your message here. Tag @pm for PM."}<<</MESSAGE>>>
```

## Workflow

### Step 1: Understand the Task

If an issue number was provided:
```bash
GITHUB_TOKEN= gh issue view <issue-number> --repo AlexMartosP/mux
```

Read the issue and understand:
- What needs to be implemented
- Acceptance criteria
- Any related issues or context

### Step 2: Update Progress Tracking

Create or update `./agent-progress/steps.json`:
```json
{
  "issue": "<issue number or description>",
  "phase": "<current phase>",
  "steps": [
    {"title": "Step 1", "description": "...", "status": "pending"}
  ]
}
```

### Step 3: Begin Work

1. Read relevant files for the task
2. Make incremental changes
3. Update progress in `steps.json`
4. Test changes with `npm run tauri dev`
5. Document learnings in `./agent-progress/progress.md`

### Step 4: When Complete

1. Update `steps.json` to mark all steps completed
2. Send message to PM:
```
<<<MESSAGE>>>{"message": "@pm Completed issue #X. Changes: <summary>. Ready for review."}<<</MESSAGE>>>
```

## Quick Reference

### Project Structure
```
src/                          # Frontend (React/TypeScript)
├── components/               # 29 components (25 + 4 ui/)
├── hooks/                    # 13 custom hooks
├── lib/tauri.ts              # Tauri command wrappers
└── types/agent.ts            # TypeScript types

src-tauri/src/                # Backend (Rust)
├── commands/                 # Tauri command handlers
├── services/                 # Core business logic
├── db.rs                     # SQLite database
└── models/agent.rs           # Agent struct + status
```

### Agent Statuses
```
setting_up | idle | running | waiting_input | completed |
error | manual_control | interrupted | queued | in_review
```

### Key Commands
```bash
npm run tauri dev             # Full app with hot reload
npm run typecheck             # TypeScript check
npx shadcn@latest add <name>  # Add shadcn component
GITHUB_TOKEN= gh issue view X # View GitHub issue
```

### Adding a Tauri Command

1. **Backend**: `src-tauri/src/commands/<module>.rs`
2. **Register**: Add to `src-tauri/src/lib.rs` invoke_handler
3. **Frontend**: Add wrapper to `src/lib/tauri.ts`

## Important Notes

- See `.claude/CLAUDE.md` for design system, styling, and component patterns
- Always use Tailwind + shadcn colors (never inline styles)
- Use "Agent" not "Task", "Spawn" not "Create"
