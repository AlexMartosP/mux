# Sprint Plan: Top 5 Priority Issues

## Selected Issues (by impact)

| Priority | Issue | Title | Why |
|----------|-------|-------|-----|
| 1 | #15 | Auto-save and restore task state on restart | Critical reliability - tasks show "running" when dead |
| 2 | #5 | Graceful shutdown for running processes | Prevents zombie processes, complements #15 |
| 3 | #4 | Improve error recovery and user guidance | Better UX, reduces user frustration |
| 4 | #3 | Output pagination for large task outputs | Performance issue for power users |
| 5 | #13 | Task search and filtering | Most impactful UX improvement |

---

## Issue #15: Auto-save and restore task state on restart

### Problem
When app restarts, tasks that were "running" appear to still be running, but the process is dead.

### Implementation Plan
1. Add `last_pid` column to tasks table
2. On task start: store PID in database
3. On app startup:
   - Query all tasks with status "running"
   - Check if PID exists and is a Claude process
   - If not: update status to "interrupted"
4. Add "interrupted" status with "Resume" button
5. Resume = restart with `-c` flag (continue conversation)

### Files to Change
- `src-tauri/src/db.rs` - Add column, migration
- `src-tauri/src/models/task.rs` - Add field
- `src-tauri/src/services/claude_process.rs` - Store PID
- `src-tauri/src/lib.rs` - Startup check
- `src/components/TaskList.tsx` - Show interrupted status

---

## Issue #5: Graceful shutdown for running processes

### Problem
App close doesn't clean up running Claude processes properly.

### Implementation Plan
1. Add Tauri `on_exit` hook in lib.rs
2. On exit:
   - Get all running task PIDs from ClaudeProcessService
   - Send SIGTERM to each
   - Wait up to 5 seconds
   - Force SIGKILL if still running
3. Clean up output threads
4. Close database connection

### Files to Change
- `src-tauri/src/lib.rs` - Add exit hook
- `src-tauri/src/services/claude_process.rs` - Add shutdown method

---

## Issue #4: Improve error recovery and user guidance

### Problem
Error states show generic messages with no recovery options.

### Implementation Plan
1. Define error categories:
   - Worktree errors (exists, permission, disk space)
   - Git errors (branch conflict, merge conflict)
   - Process errors (crash, timeout)
   - Network errors (GitHub API)
2. Create error detail component with:
   - Error category icon
   - Human-readable message
   - Suggested actions (buttons)
   - Expandable technical details
3. Add "Retry" action for recoverable errors
4. Add "View Logs" for debugging

### Files to Change
- `src/components/ErrorState.tsx` - New component
- `src/components/ChatView.tsx` - Use ErrorState
- `src-tauri/src/error.rs` - Categorize errors

---

## Issue #3: Output pagination for large task outputs

### Problem
Large outputs cause memory issues and UI lag.

### Implementation Plan
1. Add pagination to `get_task_output` command:
   - Accept `offset` and `limit` parameters
   - Default: last 100 entries
2. Create virtual scroll component for output
3. Load more on scroll up (older entries)
4. Keep recent entries in memory, lazy load older

### Files to Change
- `src-tauri/src/db.rs` - Paginated query
- `src-tauri/src/commands/task.rs` - Accept pagination params
- `src/hooks/useTaskOutput.ts` - Pagination state
- `src/components/OutputRenderer.tsx` - Virtual scroll

---

## Issue #13: Task search and filtering

### Problem
No way to search or filter tasks beyond repository.

### Implementation Plan
1. Add search input in sidebar header
2. Add filter dropdowns:
   - Status: All, Running, Completed, Error
   - Date: Today, This week, This month, All time
3. Add sort options:
   - Date (newest/oldest)
   - Name (A-Z/Z-A)
   - Status
4. Implement frontend filtering (data is small)
5. Persist filter preferences in settings

### Files to Change
- `src/components/Sidebar.tsx` - Search/filter UI
- `src/components/TaskList.tsx` - Apply filters
- `src/hooks/useTasks.ts` - Filter logic

---

## Execution Order

```
#15 (state restore) → #5 (graceful shutdown) → #4 (error recovery) → #3 (pagination) → #13 (search)
```

#15 and #5 are related and should be done together. #4 improves the experience when things go wrong. #3 and #13 are independent UX improvements.
