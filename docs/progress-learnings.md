# Progress Learnings

## FR-009: Fix NVM shell environment in worktree

**Status**: ✅ Completed

### Initial Analysis

**Problem**: When Claude runs in a worktree, it doesn't have access to the correct node version because nvm isn't properly initialized.

**Root Cause Found**:
- `WorktreeService::get_shell_env()` in `worktree.rs` extracts the full login shell environment (including nvm paths)
- This environment is used when running `git worktree add` commands
- However, `ClaudeProcessService::start()` in `claude_process.rs` did NOT use this shell environment
- The Claude process just inherited the default Tauri process environment, which lacks nvm initialization

### Solution Implemented

1. **Created shared shell module** (`/src-tauri/src/services/shell.rs`):
   - Extracted `get_shell_env()` into a reusable module
   - Added `-i` (interactive) flag in addition to `-l` (login) to ensure `.zshrc`/`.bashrc` are sourced (where nvm is typically initialized)
   - Added fallback: tries `-l -i -c env` first, falls back to just `-l -c env` if interactive fails
   - Exposed `command_with_shell_env()` and `apply_shell_env()` utilities

2. **Updated `claude_process.rs`**:
   - Now uses `shell::command_with_shell_env("claude")` instead of `Command::new("claude")`
   - This ensures the Claude process inherits the full shell environment including nvm paths

3. **Updated `worktree.rs`**:
   - Removed duplicate `get_shell_env()` and `command_with_shell_env()` implementations
   - Now imports and uses shared `shell::command_with_shell_env()`

### Key Learning
The `-i` (interactive) flag is important because many users have nvm initialization in their `.zshrc` or `.bashrc` which are only sourced for interactive shells, not just login shells. The `-l` flag alone wasn't sufficient.

### Files Changed
- `src-tauri/src/services/shell.rs` (new)
- `src-tauri/src/services/mod.rs`
- `src-tauri/src/services/claude_process.rs`
- `src-tauri/src/services/worktree.rs`

### Follow-up Fix: .nvmrc handling for git hooks

**Problem**: Even with shell environment loaded, if the repo has an `.nvmrc` requiring a specific Node version (e.g., Node 22), git hooks would fail because the user's default nvm version might be different.

**Root Cause**: Git hooks run during `git worktree add` and need the correct Node version. Simply loading the shell environment captures the user's default Node, not the project-specific version.

**Solution**: Updated `create_worktree()` to run git through a shell script that:
1. Sources nvm
2. Checks for `.nvmrc` in the repo and runs `nvm use` (or `nvm install` if needed)
3. Then runs the git worktree command

This ensures git hooks have access to the correct Node version specified by the project.

### Follow-up Fix: Main thread blocking (rainbow spinner)

**Problem**: Creating tasks caused the app to freeze with macOS rainbow spinner because slow operations were blocking the main thread.

**Root Cause**:
- `generate_task_info()` calls Claude CLI synchronously
- `create_worktree()` runs shell commands with nvm synchronously
- Both were running on Tauri's main thread

**Solution**: Made `create_task` and `delete_task` commands async using `tokio::task::spawn_blocking()`:
- Metadata generation runs in a blocking task pool thread
- Worktree creation/deletion runs in a blocking task pool thread
- Main thread stays responsive

**Key Learning**: Tauri commands that perform I/O or call external processes should use `async` with `spawn_blocking` for blocking operations to keep the UI responsive.

---

## FR-010: Render Claude response without message box

**Status**: ✅ Completed

Simple change - removed the message box wrapper (background, border, "CLAUDE" label) around the output in ChatView.tsx. The OutputRenderer now renders directly in the output area.

### Files Changed
- `src/components/ChatView.tsx` (lines 449-467)

---

## FR-011: Render thinking steps with accordion

**Status**: ✅ Completed

### Implementation

1. **Backend** (`claude_process.rs`):
   - Added `ContentBlock::Thinking` variant to parse thinking blocks from Claude's stream-json output
   - Emit thinking content as `output_type: "thinking"` in OutputEvent
   - Also emit as ActivityEvent with `activity_type: "thinking"`

2. **Frontend** (`OutputRenderer.tsx`):
   - Added `"thinking"` to OutputSection type
   - Created `ThinkingSection` component with collapsible accordion
   - Shows truncated preview (100 chars) when collapsed
   - Shows full content when expanded
   - Styled with dim gray to distinguish from regular output

### Key Learning
Claude Code's stream-json format includes `type: "thinking"` content blocks that contain the model's reasoning. These appear alongside text and tool_use blocks.

### Files Changed
- `src-tauri/src/services/claude_process.rs`
- `src/components/OutputRenderer.tsx`

---

## FR-012: Render tool calls in response with details

**Status**: ✅ Completed

### Implementation

1. **Backend** (`claude_process.rs`):
   - Extended `OutputEvent` struct to include optional `tool_name` and `tool_input` fields
   - Tool events now include full input data for expandable details

2. **Frontend** (`OutputRenderer.tsx`):
   - Updated `OutputSection` interface to include `toolInput`
   - Created `ToolInputDetails` component with tool-specific formatting
   - Tool sections now expand to show relevant details:
     - **Read**: file path, offset, limit
     - **Write**: file path, content preview (truncated)
     - **Edit**: file path, old/new string diffs with color coding
     - **Bash**: full command, description
     - **Glob/Grep**: pattern, path, glob filters
     - **Task**: description, prompt preview
     - **Default**: JSON dump for unknown tools

3. **Types** (`task.ts`):
   - Added `tool_name` and `tool_input` optional fields to `OutputLine`

### Key Learning
The expand button on tool sections was non-functional before because there was no detail data. By passing tool_input from backend to frontend, we can now show meaningful expanded content.

### Files Changed
- `src-tauri/src/services/claude_process.rs`
- `src/components/OutputRenderer.tsx`
- `src/types/task.ts`

---

## FR-014: Notifications for permissions and completion

**Status**: ✅ Completed

### Implementation

1. **Backend** (`settings.rs`):
   - Added `notify_on_completion` and `notify_on_error` boolean fields to `AppSettings`
   - Settings default to `true` for both
   - Updated `get_settings` and `update_settings` to handle new fields

2. **Frontend** (`tauri.ts`):
   - Updated `AppSettings` interface with new notification fields

3. **Frontend** (`Settings.tsx`):
   - Added "NOTIFICATIONS" section with checkboxes
   - Toggle for completion notifications
   - Toggle for error notifications

4. **Frontend** (`useTasks.ts`):
   - Updated notification listener to check settings before showing
   - Detects notification type from title or payload
   - Respects user's notification preferences

### Key Learning
The notification system was already partially implemented (backend emits events, frontend sends system notifications). The main work was adding configurable settings and wiring them up.

### Files Changed
- `src-tauri/src/commands/settings.rs`
- `src/lib/tauri.ts`
- `src/components/Settings.tsx`
- `src/hooks/useTasks.ts`

---

## Fast Task Creation (Instant UI Feedback)

**Status**: ✅ Completed

### Problem

Creating tasks was slow because metadata generation (calling Claude to get title, description, branch name) blocked the UI. Users had to wait several seconds before seeing their task in the list.

### Solution

Implemented a pattern where tasks are created instantly with temporary values, then metadata is loaded in the background:

1. **Instant branch name generation**: Use `human_ids` crate to generate human-readable temporary branch names like `task/blue-mountain-sunset`

2. **Two-phase task creation**:
   - Phase 1: Create task immediately with temp name "Loading...", empty description, and generated branch
   - Phase 2: Background metadata generation updates the task when ready

3. **Parallel background work**:
   - Worktree creation + Claude work starts in one background task
   - Metadata generation runs in a separate parallel background task
   - Frontend updates via `task-metadata` event when metadata is ready

### Implementation Details

**Backend (`src-tauri/src/models/task.rs`)**:
- Added `metadata_loading: bool` field to Task struct
- Created `new_with_temp_name()` constructor that:
  - Generates a human-readable branch name using `human_ids::generate(None)`
  - Sets `name` to "Loading..."
  - Sets `metadata_loading` to `true`

**Backend (`src-tauri/src/commands/task.rs`)**:
- `create_task` now returns immediately after creating the task with temp values
- Spawns two background `tokio::spawn` tasks:
  1. Worktree creation + Claude process startup
  2. Metadata generation with Claude
- Emits `task-metadata` event when metadata is ready

**Frontend (`src/hooks/useTasks.ts`)**:
- Added listener for `task-metadata` event
- Updates task with new metadata and sets `metadata_loading: false`

**Frontend (`src/components/TaskList.tsx`)**:
- Added `LoadingIndicator` and `SkeletonText` components
- Shows animated loading skeleton when `task.metadata_loading` is true

### Key Learnings

1. **Rust closure move semantics**: When using `tokio::task::spawn_blocking` inside an async block, variables moved into the blocking closure can't be used afterwards. Solution: Clone `Arc` references and strings before the closure to keep copies available.

2. **human_ids crate**: The API is `human_ids::generate(None)` not `human_ids::new_id_for("prefix")`. Returns strings like `blue-mountain-sunset`.

3. **Tauri async commands**: Use `async` keyword with `tokio::task::spawn_blocking` for blocking I/O operations to keep the main thread responsive.

4. **Event-driven UI updates**: Using Tauri events (`app_handle.emit()`) to notify the frontend when background work completes provides a clean separation between long-running backend work and UI updates.

### Files Changed
- `src-tauri/Cargo.toml` (added `human_ids = "0.1"`)
- `src-tauri/src/models/task.rs`
- `src-tauri/src/db.rs`
- `src-tauri/src/commands/task.rs`
- `src/types/task.ts`
- `src/hooks/useTasks.ts`
- `src/components/TaskList.tsx`

---

## Bug Fix: Branch Rename on Metadata Generation

**Status**: ✅ Fixed

### Problem

When task metadata was generated with a new branch name, the git branch was not actually being renamed. The task stored the temp branch name (`task/blue-mountain-sunset`) but the generated branch name (e.g., `john/abc-123/fix-login-bug`) was ignored.

### Solution

1. Added `rename_branch()` function to `WorktreeService` that runs `git branch -m old-name new-name` in the worktree.

2. Updated the metadata update flow in `task.rs` to:
   - Check if the generated branch name differs from the current branch
   - Call `rename_branch()` to rename the git branch
   - Update the database with the new branch name
   - Fall back to original branch name if rename fails

### Files Changed
- `src-tauri/src/services/worktree.rs` (added `rename_branch`)
- `src-tauri/src/commands/task.rs` (call rename on metadata update)

---

## Bug Fix: Conversation Persistence

**Status**: ✅ Fixed

### Problem

When navigating away from a task and back, the conversation was cleared. The output was not being properly loaded from the database.

### Root Cause

The database was storing raw stdout (the raw JSON lines from Claude) with `output_type: "stdout"`, but events were emitted with parsed `output_type` values ("text", "tool", "thinking", etc.). When loading from the database, the frontend received raw stdout which didn't match the expected output types.

### Solution

1. Updated `OutputLine` struct in `db.rs` to include `tool_name` and `tool_input` fields.

2. Added `tool_name` and `tool_input` columns to the `task_output` table (with migration for existing DBs).

3. Updated `append_output()` to accept and store `tool_name` and `tool_input` parameters.

4. Updated `get_task_output()` to return all fields including `tool_name` and `tool_input`.

5. Updated `claude_process.rs` to store **parsed** output instead of raw stdout:
   - Text content stored as `output_type: "text"`
   - Thinking content stored as `output_type: "thinking"`
   - Tool calls stored as `output_type: "tool"` with `tool_name` and `tool_input`
   - System messages stored as `output_type: "system"`
   - Results stored as `output_type: "result"`

### Key Learning

When persisting data that will be displayed in the UI, store it in the same format the UI expects. Don't store raw data and rely on parsing it later - this creates inconsistency between live events and loaded data.

### Files Changed
- `src-tauri/src/db.rs` (schema, OutputLine struct, append/get methods)
- `src-tauri/src/services/claude_process.rs` (store parsed output)

---

## Refactor: Output Multiplexer (OutputMux)

**Status**: ✅ Completed

### Motivation

The code for handling Claude output had duplicated logic for:
1. Storing output in the database
2. Emitting events to the frontend
3. Emitting activity events

This made the code verbose and error-prone - any change to output handling required updating multiple places.

### Solution

Created a unified `OutputMux` interface in `src-tauri/src/services/output.rs` that:
1. Accepts `ParsedOutput` - a unified output type
2. Automatically stores to database
3. Automatically emits to frontend
4. Automatically emits activity events for relevant types

### Architecture

```
Claude Response
      │
      ▼
 Parse JSON
      │
      ▼
 ParsedOutput (unified type)
      │
      ▼
  OutputMux
      │
      ├──► Database (append_output)
      │
      ├──► Frontend (task-output event)
      │
      └──► Activity Feed (task-activity event)
```

### Usage

```rust
// Create mux for a task
let mux = OutputMux::new(db, app_handle, task_id);

// Emit different output types
mux.emit(ParsedOutput::text("Hello world".to_string()));
mux.emit(ParsedOutput::thinking("Let me think...".to_string()));
mux.emit(ParsedOutput::tool(summary, tool_name, tool_input));
mux.emit(ParsedOutput::result("Task completed".to_string()));
mux.emit(ParsedOutput::system("System message".to_string()));
mux.emit(ParsedOutput::stdout("Raw output".to_string()));
mux.emit(ParsedOutput::stderr("Error output".to_string()));

// For tool results (activity only, no persistence)
mux.emit_tool_result("Result content".to_string());
```

### Benefits

1. **Single source of truth**: Output format defined once in `ParsedOutput`
2. **Reduced code**: ~150 lines removed from claude_process.rs
3. **Consistency**: Database and events guaranteed to match
4. **Extensibility**: Easy to add new output types or destinations
5. **Testability**: OutputMux can be easily mocked for testing

### Files Changed
- `src-tauri/src/services/output.rs` (new - OutputMux and ParsedOutput)
- `src-tauri/src/services/mod.rs` (export OutputMux)
- `src-tauri/src/services/claude_process.rs` (simplified using OutputMux)

---

## FR-024: Takeover/Take Back Control

**Status**: ✅ Completed

### Purpose

Allow users to temporarily pause Claude and take manual control of the worktree, then hand control back to Claude when ready.

### Implementation

1. **Backend Commands** (`src-tauri/src/commands/task.rs`):
   - `takeover_task`: Stops Claude process, sets status to `manual_control`, emits `task-status` event
   - `handback_task`: Starts Claude with continue conversation, uses provided prompt or default "Continue working on the task. Check for any changes that were made manually and incorporate them."

2. **Frontend Functions** (`src/lib/tauri.ts`):
   - `takeoverTask(id: string)`: Invokes the takeover command
   - `handbackTask(id: string, prompt?: string)`: Invokes the handback command

3. **UI** (`src/components/ChatView.tsx`):
   - TAKEOVER button (magenta) appears when task is running
   - TAKE BACK button (green) appears when task is in manual_control status
   - Manual control banner updated to explain the workflow

### Key Learning

The IPC server already had `handle_takeover` and `handle_handback` functions for CLI use. The Tauri commands replicate the same logic to expose it through the UI.

### Files Changed
- `src-tauri/src/commands/task.rs` (new commands)
- `src-tauri/src/commands/mod.rs` (exports)
- `src-tauri/src/lib.rs` (invoke_handler)
- `src/lib/tauri.ts` (frontend functions)
- `src/components/ChatView.tsx` (UI buttons)

---

## FR-025: Permission UI as Task-Scoped Popover

**Status**: ✅ Completed

### Problem

The permission dialog was a global full-screen modal that appeared regardless of which task was selected. This was disorienting for users who might have multiple tasks running.

### Solution

1. **Modified `usePermissions` hook** to support task-scoped filtering:
   - Accepts optional `taskId` parameter
   - Filters permission requests by task_id when provided
   - Uses global state to share requests across multiple hook instances
   - Returns `totalPendingCount` for global awareness

2. **Created `PermissionPopover` component**:
   - Inline popover that appears within the ChatView
   - Shows tool name, description, and expandable details
   - Same keyboard shortcuts (Enter=allow, Esc=deny)
   - More compact design that fits within the task context

3. **Integrated into ChatView**:
   - Renders `PermissionPopover` above the follow-up input
   - Only shows permissions for the currently selected task
   - Uses task-scoped `usePermissions(task?.id)`

4. **Removed global dialog from App.tsx**:
   - Removed `PermissionDialog` import and rendering
   - Removed `usePermissions` hook from App level
   - Permissions are now entirely task-scoped

### Key Learning

Using global state in a hook while allowing filtering per-instance requires careful management. The pattern used:
- Global variables for shared state (`globalRequests`, `globalSetRequests`)
- Each hook instance syncs with global state
- Updates propagate to all instances
- Filtering happens per-instance based on provided parameters

### Files Changed
- `src/hooks/usePermissions.ts` (task filtering support)
- `src/components/PermissionPopover.tsx` (new compact component)
- `src/components/ChatView.tsx` (integrate popover)
- `src/App.tsx` (remove global dialog)

---

## FR-026: Permission Request Notification

**Status**: ✅ Completed

### Purpose

Notify users when a permission request comes in, especially if they're not looking at the task that's requesting permission.

### Implementation

1. **System Notification** in `usePermissions.ts`:
   - Added `sendPermissionNotification()` function that sends a system notification
   - Checks if `prompt_for_permissions` is enabled in settings
   - Shows notification title "Permission Required" with tool details
   - Notification includes truncated command/file path for context

2. **Visual Indicator in Sidebar** (`TaskList.tsx`):
   - Added `pendingPermissionTaskIds` prop to TaskList
   - Shows `[?]` indicator (yellow) next to tasks with pending permissions
   - Left border also highlights yellow for tasks needing attention

3. **usePermissions Hook Updates**:
   - Added `pendingTaskIds` return value (Set of all task IDs with pending permissions)
   - Only sets up event listener once globally with `listenerSetup` flag
   - Sends notification when new permission request arrives

4. **Sidebar Integration**:
   - Added usePermissions hook to get pendingTaskIds
   - Passes to TaskList for visual indicators

### Key Learning

When using global state in hooks with side effects (like notifications), need to ensure the side effect only runs once. Used a module-level `listenerSetup` flag to prevent duplicate listeners across multiple hook instances.

### Files Changed
- `src/hooks/usePermissions.ts` (notifications, pendingTaskIds)
- `src/components/TaskList.tsx` (visual indicator)
- `src/components/Sidebar.tsx` (pass pendingTaskIds)

---

## Bug Fix: Respect prompt_for_permissions Setting

**Status**: ✅ Fixed

### Problem

The `prompt_for_permissions` setting existed in the app but was not being respected. The IPC server always emitted permission requests to the frontend regardless of the setting.

### Solution

Updated `handle_permission_request` in `ipc_server.rs` to:
1. Check the `prompt_for_permissions` setting from the database
2. If `false`, immediately auto-approve the permission request
3. If `true`, emit to frontend and wait for user response (existing behavior)

### Key Learning

When adding settings that control behavior, need to check at the actual decision point where the behavior happens (backend IPC handler), not just in the UI layer (frontend notification).

### Files Changed
- `src-tauri/src/services/ipc_server.rs` (check setting before prompting)

---

## Issue #15: Auto-save and restore task state on restart

**Status**: ✅ Completed

### Problem

When the app restarts (intentionally or from a crash), tasks that were marked as "running" would still show as running in the UI, even though the Claude process was no longer alive. This created a confusing state where users couldn't interact with the task properly.

### Solution

1. **Added `last_pid` column to tasks table** (`db.rs`):
   - Migration adds `last_pid INTEGER` column
   - New method `update_task_status_and_pid()` updates both status and PID atomically
   - New method `get_running_tasks_with_pids()` queries tasks with "running" status

2. **Store PID when task starts** (`claude_process.rs`):
   - After spawning the Claude process, store PID in database
   - When process completes, clear PID from database

3. **Added `Interrupted` status** (`models/task.rs`):
   - New `TaskStatus::Interrupted` variant
   - Represents tasks that were running but process died unexpectedly

4. **Startup recovery check** (`lib.rs`):
   - On app startup, query all tasks with "running" status
   - Check if their PID is still alive using `kill(pid, 0)` (signal 0 = check existence)
   - If process is dead, change status to "interrupted"

5. **Frontend UI updates**:
   - Added "interrupted" to `TaskStatus` type (`types/task.ts`)
   - Added orange status indicator in `TaskList.tsx`
   - Added orange "INTERRUPTED" banner in `ChatView.tsx` with RESUME button
   - Banner explains what happened and offers one-click resume

### Process Lifecycle

```
Task Created → Running (PID stored in DB)
                    │
         ┌─────────┴─────────┐
         │                   │
    Normal Exit         App Closes/Crash
         │                   │
    Completed/Error     PID left in DB
                             │
                      App Restarts
                             │
                      Check PID alive?
                             │
                    ┌────────┴────────┐
                    │                 │
                  Yes (rare)        No
                    │                 │
                Keep Running     Interrupted
                                     │
                              User clicks RESUME
                                     │
                                  Running
```

### Key Learning

Using `kill(pid, 0)` on Unix is a reliable way to check if a process exists without sending any actual signal. The call returns 0 if the process exists, -1 otherwise.

### Files Changed

- `src-tauri/src/models/task.rs` - Added `Interrupted` status
- `src-tauri/src/db.rs` - Added `last_pid` column, new methods
- `src-tauri/src/services/claude_process.rs` - Store/clear PID, added `is_pid_alive()`, `shutdown_all()`
- `src-tauri/src/lib.rs` - Startup recovery check
- `src/types/task.ts` - Added "interrupted" to TaskStatus
- `src/components/TaskList.tsx` - Added interrupted status config
- `src/components/ChatView.tsx` - Added interrupted banner with RESUME button

---

## Issue #5: Graceful shutdown for running processes

**Status**: ✅ Completed

### Problem

When the app was closed while tasks were running, Claude processes would continue running in the background as orphaned processes. This wasted resources and could cause issues when the app was reopened.

### Solution

1. **Added exit handler in `lib.rs`**:
   - Changed from `.run()` to `.build().run()` to get access to run events
   - Handle `RunEvent::Exit` event
   - On exit: mark all running tasks as "interrupted" in database
   - Call `shutdown_all()` to terminate all Claude processes

2. **`shutdown_all()` method** (`claude_process.rs`):
   - Gets all running PIDs from the in-memory map
   - Sends SIGTERM to each process
   - Clears the process map
   - Waits 1 second for graceful termination

### Exit Flow

```
User closes app
      │
      ▼
RunEvent::Exit triggered
      │
      ▼
Get all running task PIDs
      │
      ▼
Mark each as "interrupted" in DB
      │
      ▼
Send SIGTERM to each process
      │
      ▼
Wait for processes to terminate
      │
      ▼
App exits cleanly
```

### Key Learning

In Tauri v2, to handle exit events, use `.build()` then `.run()` with a closure instead of just `.run()`. The closure receives `RunEvent` which includes `RunEvent::Exit`.

### Files Changed

- `src-tauri/src/lib.rs` - Added exit event handler

---

## Issue #4: Improve error recovery and user guidance

**Status**: ✅ Completed

### Problem

When errors occurred, users saw generic error messages with no guidance on how to recover. The error status just showed "ERROR" with no context or recovery options.

### Solution

1. **Enhanced AppError type** (`error.rs`):
   - Added `Worktree` error variant
   - Added `category()` method - returns error category for UI display
   - Added `is_recoverable()` method - indicates if retry might help
   - Added `suggestions()` method - returns helpful recovery suggestions
   - Updated serialization to include all error metadata as structured JSON

2. **Created ErrorDisplay component** (`ErrorDisplay.tsx`):
   - `ErrorDisplay` - Full error display with category icon, message, suggestions, and action buttons
   - `InlineError` - Compact inline error for forms
   - Category-specific icons and colors (git, github, process, worktree, etc.)

3. **Added error banner for error status tasks** (`ChatView.tsx`):
   - Shows red banner when task status is "error"
   - Explains that task failed with guidance to check output
   - Includes RETRY button to restart the task

4. **Updated inline error display** (`ChatView.tsx`):
   - Replaced raw error text with `InlineError` component
   - Consistent styling with error system

### Error Categories

| Category | Icon | Color | Examples |
|----------|------|-------|----------|
| database | DB | Red | SQLite errors |
| io | IO | Red | File system errors |
| git | G | Orange | Branch conflicts, worktree issues |
| github | GH | Magenta | Auth, push errors |
| process | P | Red | Claude CLI errors |
| worktree | WT | Orange | Worktree creation failures |
| not_found | ? | Yellow | Task/repo not found |

### Key Learning

Structured error responses (with category, recoverable flag, suggestions) are much more useful than plain strings. The frontend can make intelligent decisions about what UI to show based on the error metadata.

### Files Changed

- `src-tauri/src/error.rs` - Enhanced error type with metadata
- `src/components/ErrorDisplay.tsx` - New error display components
- `src/components/ChatView.tsx` - Error banner for error status, InlineError usage

---

## Issue #3: Output pagination for large task outputs

**Status**: ✅ Completed

### Problem

For long-running tasks, the output could contain thousands of entries which caused:
1. Slow initial load times when selecting a task
2. High memory usage for tasks with extensive output
3. Potential UI lag when rendering large output lists

### Solution

Implemented pagination for task output with a "Load more" pattern:

1. **Backend pagination support** (`db.rs`):
   - Updated `get_task_output()` to accept `offset` parameter
   - Reduced default limit from 1000 to 200 for faster initial loads
   - Added `get_task_output_count()` to get total output count for a task

2. **Updated Tauri command** (`commands/task.rs`):
   - Added `offset` parameter to `get_task_output` command
   - New `get_task_output_count` command

3. **Frontend API** (`lib/tauri.ts`):
   - Updated `getTaskOutput()` to accept offset parameter
   - Added `getTaskOutputCount()` function

4. **Updated useTaskOutput hook** (`hooks/useTaskOutput.ts`):
   - Tracks `totalCount`, `loadedCount`, and `hasMore` state
   - Loads initial batch (200 items) on task selection
   - `loadMore()` function fetches next batch
   - Real-time events still append to output and update counts

5. **UI with Load More button** (`ChatView.tsx`):
   - "Load more (N remaining)" button appears when there's more output
   - Button disabled while loading
   - Shows remaining count so users know how much more there is

### Load Flow

```
Task Selected
      │
      ▼
Fetch count + first 200 items (parallel)
      │
      ▼
Display items + "Load more" if hasMore
      │
      ▼
User clicks "Load more"
      │
      ▼
Fetch next 200 items (offset = loadedCount)
      │
      ▼
Append to output, update counts
      │
      ▼
Hide button when no more items
```

### Key Learning

The pagination approach (load more at the bottom) works well for output that grows over time because:
- Initial output loads from the beginning (offset 0)
- Real-time events append at the end
- Loading more continues from where we left off
- Users see the chronological flow naturally

For reverse chronological feeds (like news/social), you'd typically load newest first and "load more" would fetch older items. But for task output, chronological (oldest first) makes more sense.

### Files Changed

- `src-tauri/src/db.rs` - Added offset parameter, count method
- `src-tauri/src/commands/task.rs` - Added offset parameter, count command
- `src-tauri/src/commands/mod.rs` - Export new command
- `src-tauri/src/lib.rs` - Register new command
- `src/lib/tauri.ts` - Updated API functions
- `src/hooks/useTaskOutput.ts` - Pagination state and loadMore
- `src/components/ChatView.tsx` - Load more button

---

## Issue #13: Task search and filtering

**Status**: ✅ Completed

### Problem

As the number of tasks grows, finding specific tasks becomes difficult. Users needed:
- Text search across task names, descriptions, prompts, and branches
- Status filtering (show only running, completed, error tasks)
- Sorting options (by date, name, status)

### Solution

Enhanced the Sidebar component with comprehensive search and filter capabilities:

1. **Text search input**:
   - Search across task name, description, prompt, and branch
   - Case-insensitive matching
   - Clear button to reset search

2. **Status filter dropdown**:
   - Multi-select dropdown for filtering by status
   - Shows all 7 status types with colored labels
   - Checkbox-based selection for multiple statuses

3. **Sort options dropdown**:
   - Newest first (default)
   - Oldest first
   - Name A-Z
   - Name Z-A
   - By status

4. **Clear all filters button**:
   - Appears when any filter is active
   - Resets search, status, and repo filters

5. **Filter count display**:
   - Shows "X of Y tasks" when filters are active

### UI Layout

```
┌─────────────────────────────────┐
│ [+ NEW TASK]           [EDIT]   │
├─────────────────────────────────┤
│ 🔍 Search tasks...         [x]  │
├─────────────────────────────────┤
│ [Status ▼]              [↕ ▼]   │
├─────────────────────────────────┤
│ [All repositories         ▼]   │
├─────────────────────────────────┤
│ [Clear all filters]             │
├─────────────────────────────────┤
│ 3 of 10 tasks                   │
└─────────────────────────────────┘
```

### Implementation Notes

All filtering and sorting is done client-side in the `filteredTasks` useMemo hook. This is appropriate because:
- Task lists are typically small (< 100 tasks)
- Instant feedback as user types
- No backend round-trips

For very large task lists, backend filtering could be added later, but client-side is sufficient for typical usage.

### Files Changed

- `src/components/Sidebar.tsx` - Added search, status filter, sort, and clear filters

---

## Issue #21: Multiple theme support

**Status**: ✅ Completed

### Problem

The app had a single "Terminal" aesthetic with dark colors, monospace fonts, and no border radius. Users wanted options for different visual styles.

### Solution

Implemented a theme system with three themes and easy extensibility for more.

### Themes Implemented

1. **Terminal** (Default)
   - Dark background (#0a0a0a)
   - Monospace fonts (Geist Mono)
   - No border radius (sharp corners)
   - Bright neon accents (green, cyan, magenta)
   - Hacker/developer aesthetic

2. **Clean** (Dark)
   - Softer dark background (#1a1a2e)
   - Sans-serif fonts (Inter)
   - Rounded corners (6px)
   - Subtle shadows for elevation
   - Professional/modern aesthetic

3. **Clean Light**
   - Light background (#f8f9fc)
   - Sans-serif fonts (Inter)
   - Rounded corners (6px)
   - Subtle shadows
   - Clean/professional aesthetic

### Implementation

**Theme Definitions** (`src/themes/index.ts`):
- `Theme` interface with id, name, description, and CSS variables
- Each theme defines all CSS custom properties
- `getThemeById()` helper function

**Theme Context** (`src/contexts/ThemeContext.tsx`):
- React context for theme state
- Loads theme from settings on mount
- Applies CSS variables to document root
- Dynamically toggles border-radius style based on theme
- Persists theme choice to settings

**Settings Integration**:
- Added `theme` field to `AppSettings` in both Rust and TypeScript
- Theme picker in Settings with radio buttons and descriptions
- Visual preview with active state highlighting

**CSS Changes** (`src/index.css`):
- Removed hardcoded `border-radius: 0` rule
- Border radius now controlled dynamically by ThemeContext

### Theme Variables

Each theme defines these CSS custom properties:
- Backgrounds: `--bg-primary`, `--bg-surface`, `--bg-elevated`
- Borders: `--border-default`, `--border-active`, `--border-bright`
- Text: `--text-primary`, `--text-secondary`, `--text-dim`
- Accents: `--accent-green`, `--accent-yellow`, `--accent-red`, `--accent-cyan`, `--accent-magenta`, `--accent-orange`
- Typography: `--font-family`, `--font-mono`
- Shape: `--border-radius`, `--border-radius-sm`, `--border-radius-lg`
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

### Key Learning

Making the border-radius theme-driven required a hybrid approach:
- CSS variables for the values
- JavaScript to inject/remove a style rule that overrides all border-radius (for Terminal theme)

This is because `!important` in CSS can't be conditionally applied based on variables.

### Files Changed

- `src/themes/index.ts` (new) - Theme definitions
- `src/contexts/ThemeContext.tsx` (new) - Theme context and provider
- `src-tauri/src/commands/settings.rs` - Added theme field
- `src/lib/tauri.ts` - Added theme to AppSettings
- `src/components/Settings.tsx` - Theme picker UI
- `src/components/Onboarding.tsx` - Added theme field
- `src/App.tsx` - Wrapped with ThemeProvider
- `src/index.css` - Removed hardcoded border-radius

---

## Issue #8: Export task history and reports

**Status**: ✅ Completed

### Problem

Users needed to export task history for:
- Backup before cleanup
- Sharing with team members
- Audit trails for code changes
- Productivity reports

### Solution

Implemented export functionality with multiple formats and options.

### Export Formats

1. **JSON** - Full structured data export
   - All task metadata
   - Optional full output history
   - Machine-readable for processing

2. **CSV** - Tabular format
   - Task summary in spreadsheet format
   - Good for analysis in Excel/Google Sheets
   - Columns: id, name, description, repository, branch, status, created_at, pr_url

3. **Markdown** - Human-readable report
   - Formatted with headers and sections
   - Includes descriptions and prompts
   - Optional output with formatting (tool calls, thinking, etc.)
   - Good for documentation

### Export Options

- **Format selection** - Radio buttons for JSON/CSV/Markdown
- **Include output** - Checkbox to include full task output (increases file size)

### Implementation

**Backend** (`src-tauri/src/commands/export.rs`):
- `export_tasks` command takes options and returns formatted string
- `TaskExport` struct for clean serialization
- Separate formatters for each format type
- CSV escaping for special characters
- Markdown formatting with proper structure

**Frontend** (`src/components/Settings.tsx`):
- Export section in Settings panel
- Format selection radio buttons
- Include output checkbox
- Export button with loading state
- Uses Tauri dialog for save location
- Uses Tauri fs plugin to write file

### Dependencies Added

- `@tauri-apps/plugin-fs` - Frontend file writing
- `tauri-plugin-fs` - Backend file operations
- Added `fs:default` and `fs:allow-write-text-file` to capabilities

### Key Learning

Using Tauri's dialog plugin for the save file dialog and the fs plugin to write the content provides a native experience. The content is generated in Rust and sent to the frontend, which then handles the file save through Tauri plugins.

### Files Changed

- `src-tauri/src/commands/export.rs` (new)
- `src-tauri/src/commands/mod.rs` - Export module
- `src-tauri/src/lib.rs` - Register command and fs plugin
- `src-tauri/Cargo.toml` - Added tauri-plugin-fs
- `src-tauri/capabilities/default.json` - Added fs permissions
- `src/lib/tauri.ts` - Added exportTasks function
- `src/components/Settings.tsx` - Added Export section
- `package.json` - Added @tauri-apps/plugin-fs

---

## Issue #14: Keyboard shortcuts for common actions

**Status**: ✅ Completed

### Problem

Power users need keyboard shortcuts to quickly perform common actions without reaching for the mouse.

### Solution

Created a `useKeyboardShortcuts` hook that handles all global and task-specific shortcuts.

### Implemented Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘+N` | New task |
| `⌘+,` | Open settings |
| `⌘+⇧+F` | Focus search |
| `Esc` | Close modal/settings |
| `⌘+↑` | Previous task |
| `⌘+↓` | Next task |
| `⌘+1-9` | Select task by position |
| `⌘+.` | Stop task |
| `⌘+R` | Restart task |
| `⌘+⇧+C` | Copy branch name |
| `⌘+P` | Create PR |

### Implementation Details

1. **useKeyboardShortcuts hook** (`src/hooks/useKeyboardShortcuts.ts`):
   - Handles all keyboard events
   - Respects input focus (doesn't trigger when typing)
   - Platform-aware (uses ⌘ on Mac, Ctrl on Windows/Linux)
   - Exports `formatShortcut()` helper and `SHORTCUTS` constants

2. **Integration**:
   - Hook used in App.tsx with all handlers
   - Sidebar receives `searchInputRef` for focus shortcut
   - Buttons show shortcut hints in tooltips

3. **Shortcut Hints**:
   - "New task (⌘N)" in button tooltip
   - "Settings (⌘,)" in button tooltip
   - "Search tasks... (⌘⇧F)" in search placeholder

### Key Learning

When implementing keyboard shortcuts:
- Always check if user is focused on an input before triggering
- Use `e.preventDefault()` to stop browser defaults (e.g., Cmd+P for print)
- Make shortcuts discoverable via tooltips
- Consider platform differences (Mac vs Windows/Linux)

### Files Changed

- `src/hooks/useKeyboardShortcuts.ts` (new)
- `src/App.tsx` - Integrated hook with handlers
- `src/components/Sidebar.tsx` - Added searchInputRef and shortcut hints

---

## FR-027: Respect Claude Code Permission Settings

**Status**: 🔲 Pending

### Description

Mux should read and respect the user's Claude Code permission settings before prompting for permissions. Currently, Mux only uses its own `prompt_for_permissions` toggle and ignores Claude Code's configured allowed/denied tools.

### Claude Code Settings Locations
- `~/.claude/settings.json` (global user settings)
- `.claude/settings.json` (project settings, shared)
- `.claude/settings.local.json` (project settings, local)

### Permission Format
```json
{
  "permissions": {
    "allow": ["Read", "Bash(git *)", "Write(./src/**)"],
    "deny": ["Read(./.env)", "Bash(rm -rf *)"]
  }
}
```

### Implementation Plan

1. **Settings Reader**: Create a function to read and merge Claude Code settings
   - Read global settings from `~/.claude/settings.json`
   - Read project settings from worktree's `.claude/settings.json`
   - Merge with project taking precedence over global

2. **Pattern Matcher**: Implement pattern matching for tool permissions
   - `Read` matches any Read tool use
   - `Bash(git *)` matches Bash commands starting with "git"
   - `Write(./src/**)` matches Write to files in src directory

3. **Permission Check Flow**:
   - Check if tool matches any `deny` patterns → auto-deny
   - Check if tool matches any `allow` patterns → auto-approve
   - Otherwise → check Mux's `prompt_for_permissions` setting

### Files to Change
- `src-tauri/src/services/ipc_server.rs` (permission check logic)
- `src-tauri/src/services/claude_settings.rs` (new - settings reader)

---
