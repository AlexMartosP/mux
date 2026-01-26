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
