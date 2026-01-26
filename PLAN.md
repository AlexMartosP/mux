# Agent Coordinator - Mac Native Application Plan

## Overview
A native Mac application for managing multiple Claude Code agent instances, each running in isolated git worktrees.

## Core Requirements
- Create/manage tasks that spawn Claude Code instances in worktrees
- Notifications for agent activity
- Diff viewer for code changes
- Easy PR creation workflow
- Takeover/handback mechanism via CLI for manual intervention

## Technology Stack
- **Framework**: Tauri v2 (Rust backend + web frontend)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Storage**: SQLite via `rusqlite` (local-only, no auth)
- **Process Management**: Rust's `std::process` + `tokio` for async
- **Git Operations**: `git2` Rust crate or shell commands
- **PR Creation**: GitHub CLI (`gh`)
- **IPC**: Tauri's built-in IPC for CLI ↔ App communication

---

## Phase 1: Core App Shell & Task Management
**Goal**: Basic app that can create tasks and spawn Claude Code in worktrees

### Deliverables
1. **Tauri + React app skeleton**
   - Main window with sidebar (task list) and detail view
   - System tray presence for quick access

2. **Task Model & Storage**
   - Task: id, name, repository_path, branch, worktree_path, status, prompt, created_at
   - SQLite database in app data directory

3. **Worktree Management**
   - Create worktree: `git worktree add -B <branch> <path>`
   - Worktree stored at `../worktrees/<repo>/<branch>` relative to source repo
   - Track worktree path per task
   - Cleanup worktree on task deletion

4. **Claude Code Process Spawning**
   - Spawn `claude` CLI in the worktree directory
   - Pass initial prompt as argument
   - Track process PID for management

### Project Structure
```
agent-coordinator/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── db.rs              # SQLite setup & migrations
│       ├── models/
│       │   └── task.rs
│       ├── commands/          # Tauri commands (IPC)
│       │   ├── mod.rs
│       │   ├── task.rs
│       │   └── worktree.rs
│       └── services/
│           ├── mod.rs
│           ├── worktree.rs
│           └── claude_process.rs
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── TaskList.tsx
│   │   ├── TaskDetail.tsx
│   │   └── NewTaskModal.tsx
│   ├── hooks/
│   │   └── useTasks.ts
│   ├── lib/
│   │   └── tauri.ts           # Tauri invoke wrappers
│   └── styles/
│       └── globals.css
├── package.json
└── index.html
```

---

## Phase 2: Process Monitoring & Notifications
**Goal**: Monitor agent output and notify user of important events

### Deliverables
1. **Output Capture**
   - Pipe stdout/stderr from Claude Code process
   - Stream output to frontend via Tauri events
   - Store output history in SQLite per task

2. **Notification System**
   - Detect patterns: completion, errors, questions from agent
   - macOS native notifications via `tauri-plugin-notification`
   - Notification preferences in settings

3. **Status Indicators**
   - Task status: `idle`, `running`, `waiting_input`, `completed`, `error`
   - Visual indicators in task list (colors, badges)
   - Real-time status updates via Tauri events

### Files to Add
```
src-tauri/src/services/
├── output_monitor.rs
└── notification.rs

src/components/
├── OutputLog.tsx
└── StatusBadge.tsx
```

---

## Phase 3: Diff Viewer
**Goal**: View code changes made by the agent

### Deliverables
1. **Git Diff Integration**
   - Fetch staged/unstaged diffs using `git2` crate
   - Compare worktree branch against base branch
   - List changed files with status (added, modified, deleted)

2. **Diff UI**
   - Side-by-side or unified diff view
   - Syntax highlighting (use `react-diff-viewer` or similar)
   - File tree of changed files with expandable diffs

3. **Commit History**
   - Show commits made by agent on the branch
   - Click commit to view its changes

### Files to Add
```
src-tauri/src/services/
└── git.rs

src-tauri/src/commands/
└── git.rs

src/components/
├── DiffViewer.tsx
├── FileTree.tsx
└── CommitHistory.tsx
```

---

## Phase 4: PR Creation
**Goal**: Streamlined PR creation from the app

### Deliverables
1. **PR Workflow**
   - "Create PR" button in task detail
   - Auto-generate title from branch name
   - Auto-generate description from task prompt + commit messages
   - Preview/edit before creation

2. **GitHub CLI Integration**
   - Execute `gh pr create` in worktree directory
   - Rely on existing `gh auth` (no auth in app)
   - Capture and display PR URL

3. **PR Status**
   - Track PR URL per task
   - Button to open PR in browser
   - Detect if PR already exists for branch

### Files to Add
```
src-tauri/src/services/
└── github.rs

src-tauri/src/commands/
└── github.rs

src/components/
└── CreatePRModal.tsx
```

---

## Phase 5: Takeover & Handback (CLI-based)
**Goal**: Allow user to take manual control via CLI and return control to the agent

### Concept
The takeover mechanism works via a companion CLI that communicates with the running app:
- `agent-coordinator takeover <task>` - stops the Claude process, user works in worktree directly
- `agent-coordinator handback <task>` - resumes Claude with optional new instructions
- User can use any editor since they're just working in the worktree directory

### Deliverables
1. **Takeover Command**
   - Stop Claude Code process gracefully (SIGTERM)
   - Mark task as `manual_control` status
   - Print worktree path for user to `cd` into
   - App shows visual indicator that task is in manual mode

2. **Handback Command**
   - Accept optional `--prompt "continue with..."` argument
   - Resume Claude Code process with new/continued context
   - Mark task as `running` status

3. **CLI Tool**
   - Companion CLI binary (Rust, built with Tauri CLI feature)
   - Communicates with main app via local Unix socket or HTTP on localhost
   - Commands: `takeover`, `handback`, `list`, `status`

4. **IPC Server**
   - Main app runs lightweight local server (localhost only)
   - CLI sends commands, receives responses
   - Secure: bound to localhost, no external access

### Files to Add
```
src-tauri/src/
├── ipc_server.rs           # Local socket/HTTP server
└── cli/
    ├── mod.rs
    └── commands.rs

# Separate CLI binary (optional, or use subcommand)
agent-coordinator-cli/
├── Cargo.toml
└── src/
    └── main.rs
```

### CLI Usage Examples
```bash
# List all tasks
agent-coordinator list

# Take over a task
agent-coordinator takeover my-feature-task
# Output: Task 'my-feature-task' paused. Worktree at: /path/to/worktree
#         cd /path/to/worktree

# Hand back control
agent-coordinator handback my-feature-task
agent-coordinator handback my-feature-task --prompt "fix the failing tests"
```

---

## Future Phases (Post-MVP)
- **Multi-repo dashboard**: Manage tasks across different repositories
- **Task templates**: Save common task configurations
- **Agent history**: Full history with search
- **Pause/resume without takeover**: Pause agent, resume later
- **Other agents**: Support for Cursor Agent, Windsurf, etc.
- **Cross-platform**: Windows/Linux support (Tauri makes this easier)

---

## Implementation Order & Milestones

| Phase | Milestone | What You Can Do |
|-------|-----------|-----------------|
| 1 | MVP | Create tasks, spawn Claude in worktrees |
| 2 | Monitoring | See live output, get notifications |
| 3 | Review | View diffs before merging |
| 4 | Ship | Create PRs directly from app |
| 5 | Collaborate | Take over, fix things, hand back |

---

## Verification Plan

### Phase 1
- [ ] App launches with Tauri window
- [ ] Can create new task with name, repo path, and prompt
- [ ] Worktree created at correct path
- [ ] Claude Code process starts and runs in worktree
- [ ] Task appears in list with correct status

### Phase 2
- [ ] Live output streams to UI
- [ ] Notification appears when task completes
- [ ] Status badge updates (running → completed)
- [ ] Output persists after app restart

### Phase 3
- [ ] Can view diff of all changed files
- [ ] Syntax highlighting works
- [ ] Can expand/collapse file diffs
- [ ] Commit history shows agent's commits

### Phase 4
- [ ] Can create PR with one click
- [ ] PR description is auto-generated
- [ ] PR URL shown and clickable
- [ ] Handles "PR already exists" gracefully

### Phase 5
- [ ] `agent-coordinator takeover <task>` stops agent
- [ ] Can work in worktree with any editor
- [ ] `agent-coordinator handback <task>` resumes agent
- [ ] `--prompt` flag passes new instructions
