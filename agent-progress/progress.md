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
