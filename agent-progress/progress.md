# Roadmap Progress

## Phase 2: Agent Overview & Sidebar ✅ COMPLETE

### CI Status on Agents (#95)
- Added `get_ci_status` Tauri command using `gh pr checks`
- Created `useCIStatus` hook with caching (30s) and polling (60s)
- Shows passing (green check), failing (red X), or running (yellow spinner) in sidebar
- Integrated into AgentList component

### Unified Permissions Queue (#78)
- Created `PermissionsQueue` component
- Shows all pending permissions from all agents
- Allow/Deny/Always Allow actions
- Bulk "Allow All Safe" for read-only operations
- Keyboard support (Esc to close)
- Added `allPendingRequests` to `usePermissions` hook

## Phase 3: Agent Spawn & Setup Experience ✅ COMPLETE

### Agent Setup Screen (#96)
- Enhanced `SetupScreen` component with:
  - Full-screen progress view
  - Step-by-step status display
  - Repo and branch info
  - Cancel button with proper cleanup
  - Error state with retry option

### Branch Management (#97)
- Added custom branch name option in spawn form
- New UI: "New branch (custom name)" option
- Branch name validation (lowercase, hyphens only)
- Backend support via `SpawnAgentInput.branch_name`
- New `Agent::new_with_custom_branch` method

### Agent Naming Improvements (#99)
- Inline agent name editing (click to edit in header)
- Metadata loading indicator (⏳) in:
  - Agent header
  - Sidebar agent list
- Shows when AI is still generating name/description

## Phase 4: Agent View Polish (4.2, 4.3) ✅ COMPLETE

### Code Review Tab (#49)
- Fixed syntax highlighting by removing conflicting `@types/refractor` v3
  - refractor v5 has built-in types with common languages pre-registered
  - Default import from `refractor` now includes common bundle
- Show ALL changes (committed + uncommitted)
  - Changed `git diff` to compare working directory vs merge base
  - Previously only showed committed changes (merge_base to HEAD)
  - Now shows: `git diff {merge_base} -- {file}` (no HEAD)
- Untracked files shown as proper unified diff format

### Terminal Tab (#73)
- Fixed event field name mismatch
  - Backend was sending `task_id` but frontend expected `agent_id`
  - Updated `TerminalOutputEvent` and `TerminalExitEvent` structs
- Updated terminal theme with proper hex colors
  - xterm.js doesn't understand CSS variables
  - Changed from `var(--bg-primary)` to `#0a0a0a`, etc.
- Full terminal implementation:
  - PTY-based shell (user's $SHELL)
  - Input via `term.onData` -> `tauri.terminalInput`
  - Output via Tauri events -> `term.write`
  - Resize support via `term.onResize` -> `tauri.terminalResize`
  - Scrolling built into xterm.js

## Technical Notes

### Files Modified
- `src-tauri/src/services/github.rs` - CI status functions
- `src-tauri/src/commands/github.rs` - CI status command
- `src-tauri/src/models/agent.rs` - Custom branch support
- `src-tauri/src/commands/agent.rs` - Spawn with custom branch
- `src/hooks/useCIStatus.ts` - New hook
- `src/hooks/usePermissions.ts` - Expose all requests
- `src/components/PermissionsQueue.tsx` - New component
- `src/components/SetupScreen.tsx` - Enhanced UI
- `src/components/ChatView.tsx` - Custom branch input, metadata indicator
- `src/components/AgentList.tsx` - CI status, metadata indicator
- `src/components/Sidebar.tsx` - Permissions queue integration

### New Dependencies/Types
- `CIStatus`, `CICheck`, `CIStatusResponse` types
- `SpawnAgentInput.branch_name` optional field
