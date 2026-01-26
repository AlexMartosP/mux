# Agent Coordinator

A native Mac application for managing multiple Claude Code agent instances, each running in isolated git worktrees.

## Features

- **Task Management**: Create and manage tasks that spawn Claude Code instances
- **Isolated Worktrees**: Each task runs in its own git worktree for clean separation
- **Real-time Output**: Stream Claude's output with activity indicators
- **Diff Viewer**: Review code changes made by the agent
- **PR Creation**: Create pull requests directly from the app using GitHub CLI
- **Takeover/Handback**: Take manual control via CLI, then hand back to Claude

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **Backend**: Rust + Tauri v2
- **Storage**: SQLite (via rusqlite)
- **Process Management**: Tokio async runtime
- **Git**: Shell commands for git operations
- **GitHub**: GitHub CLI (`gh`) for PR creation

## Project Structure

```
agent-coordinator/
├── src/                          # Frontend (React)
│   ├── components/
│   │   ├── ActivityFeed.tsx      # Shows current Claude activity
│   │   ├── ChangesPanel.tsx      # Git changes overview
│   │   ├── ChatView.tsx          # Main task view with output
│   │   ├── CommitHistory.tsx     # Task commit history
│   │   ├── CreatePRModal.tsx     # PR creation dialog
│   │   ├── DiffViewer.tsx        # Side-by-side diff display
│   │   ├── FileTree.tsx          # Changed files tree
│   │   ├── OutputRenderer.tsx    # Renders Claude output as markdown
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   └── TaskList.tsx          # Task list with status badges
│   ├── hooks/
│   │   ├── useTaskActivity.ts    # Real-time activity events
│   │   ├── useTaskOutput.ts      # Output streaming
│   │   └── useTasks.ts           # Task CRUD operations
│   ├── lib/
│   │   └── tauri.ts              # Tauri command wrappers
│   ├── types/
│   │   └── task.ts               # TypeScript type definitions
│   ├── App.tsx                   # Root component
│   └── main.tsx                  # Entry point
│
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── git.rs            # Git diff/changes commands
│   │   │   ├── github.rs         # PR creation commands
│   │   │   ├── task.rs           # Task CRUD commands
│   │   │   └── mod.rs
│   │   ├── models/
│   │   │   ├── task.rs           # Task model & status enum
│   │   │   └── mod.rs
│   │   ├── services/
│   │   │   ├── claude_process.rs # Claude CLI process management
│   │   │   ├── git.rs            # Git operations (diff, commits)
│   │   │   ├── github.rs         # GitHub CLI integration
│   │   │   ├── ipc_server.rs     # TCP server for CLI communication
│   │   │   ├── worktree.rs       # Git worktree management
│   │   │   └── mod.rs
│   │   ├── cli/
│   │   │   └── main.rs           # CLI binary for takeover/handback
│   │   ├── db.rs                 # SQLite database operations
│   │   ├── error.rs              # Error types
│   │   ├── lib.rs                # App initialization
│   │   └── main.rs               # Tauri entry point
│   └── Cargo.toml
│
├── package.json
├── vite.config.ts
└── index.html
```

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ useTasks │  │useOutput │  │useActivity│  │    Components    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
│       └─────────────┴─────────────┴──────────────────┘           │
│                              │                                    │
│                     Tauri IPC (invoke)                           │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────┴───────────────────────────────────┐
│                         Backend (Rust)                            │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                      Tauri Commands                          ││
│  │  create_task, get_tasks, stop_task, get_file_diff, etc.     ││
│  └──────────────────────────────┬───────────────────────────────┘│
│                                 │                                 │
│  ┌─────────────┐  ┌─────────────┴─────────────┐  ┌─────────────┐ │
│  │   Database  │  │        Services           │  │  IPC Server │ │
│  │   (SQLite)  │  │  ┌───────────────────┐   │  │  (TCP:19532)│ │
│  │             │  │  │ ClaudeProcessSvc  │   │  │             │ │
│  │  - tasks    │  │  │ WorktreeService   │   │  │  CLI ←────┐ │ │
│  │  - output   │  │  │ GitService        │   │  │           │ │ │
│  │             │  │  │ GitHubService     │   │  │           │ │ │
│  └─────────────┘  │  └───────────────────┘   │  └───────────┘ │ │
│                   └───────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      External Processes                           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │  Claude Code   │  │      git       │  │        gh          │  │
│  │  (per task)    │  │   (worktrees)  │  │   (PR creation)    │  │
│  └────────────────┘  └────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Task Lifecycle

1. **Create**: User selects repo + prompt → worktree created → Claude spawned
2. **Running**: Claude streams output → parsed & stored → emitted to frontend
3. **Completed/Error**: Process exits → status updated → user notified
4. **Manual Control**: CLI takeover → Claude stopped → user works in worktree
5. **Handback**: CLI handback → Claude resumed with optional new prompt

### Key Services

#### ClaudeProcessService (`claude_process.rs`)
- Spawns `claude` CLI with `--output-format stream-json --verbose`
- Parses JSON output for tool usage, text, and results
- Emits events: `task-output`, `task-status`, `task-activity`, `task-description`
- Manages process lifecycle (start/stop) per task

#### WorktreeService (`worktree.rs`)
- Creates isolated git worktrees: `git worktree add -B <branch> <path>`
- Worktrees stored in `~/.agent-coordinator/worktrees/<repo>/<branch>`
- Cleanup on task deletion

#### IPCServer (`ipc_server.rs`)
- TCP server on port 19532 for CLI communication
- Commands: `list`, `status`, `takeover`, `handback`
- Enables takeover/handback workflow from terminal

### Event System

The app uses Tauri's event system for real-time updates:

| Event | Payload | Purpose |
|-------|---------|---------|
| `task-output` | `{task_id, output_type, content}` | Stream Claude output |
| `task-status` | `{task_id, status}` | Status changes |
| `task-activity` | `{task_id, activity_type, tool_name?, ...}` | Current activity |
| `task-description` | `{task_id, description}` | Auto-updated description |

## Development

### Prerequisites

- Node.js 20.19+
- Rust (via rustup)
- Claude Code CLI (`claude`)
- GitHub CLI (`gh`) - for PR creation

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run tauri dev

# Build for production
npm run tauri build
```

### CLI Tool

The CLI enables takeover/handback from terminal:

```bash
# Build CLI
cd src-tauri && cargo build --bin agent-coordinator-cli

# List tasks
./target/debug/agent-coordinator-cli list

# Take manual control
./target/debug/agent-coordinator-cli takeover <task-id>

# Hand back to Claude
./target/debug/agent-coordinator-cli handback <task-id>
./target/debug/agent-coordinator-cli handback <task-id> -p "fix the tests"
```

## Database Schema

```sql
-- Tasks table
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    repository_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    prompt TEXT NOT NULL,
    pr_url TEXT,
    created_at TEXT NOT NULL
);

-- Output lines table
CREATE TABLE task_output (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    output_type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

## Task Statuses

| Status | Description |
|--------|-------------|
| `idle` | Created but not started |
| `running` | Claude is actively working |
| `waiting_input` | Claude is waiting for input |
| `completed` | Task finished successfully |
| `error` | Task failed with error |
| `manual_control` | User has taken over via CLI |

## License

MIT
