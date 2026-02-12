# File Change Events - Usage Guide

## Overview

The GitWatcherService monitors file changes in agent worktrees and emits real-time events to the frontend. This implements the query-then-listen pattern for efficient file change tracking.

## Backend Implementation

### GitWatcherService

Located in `src-tauri/src/services/git_watcher.rs`

- **Polling Interval:** 2 seconds
- **Event Name:** `agent-file-changes`
- **Monitored Agents:** Running, Idle, WaitingInput, ManualControl

The service:
1. Polls all active agents every 2 seconds
2. Compares current changes with cached previous state
3. Emits event only when changes are detected
4. Caches changes to avoid duplicate events

### Commands

#### `get_agent_file_changes`

Retrieves current file changes for an agent.

**Rust:**
```rust
#[tauri::command]
pub fn get_agent_file_changes(
    state: State<Arc<AppState>>,
    agent_id: String,
    exclude_untracked: Option<bool>,
) -> Result<Vec<FileChange>>
```

**TypeScript:**
```typescript
export async function getAgentFileChanges(
  agentId: string,
  excludeUntracked?: boolean
): Promise<FileChange[]>
```

#### `get_agent_file_diff_data`

Retrieves detailed diff data for a specific file.

**Rust:**
```rust
#[tauri::command]
pub fn get_agent_file_diff_data(
    state: State<Arc<AppState>>,
    agent_id: String,
    file_path: String,
) -> Result<FileDiffData>
```

**TypeScript:**
```typescript
export async function getAgentFileDiffData(
  agentId: string,
  filePath: string
): Promise<FileDiffData>
```

## Frontend Usage

### Query-Then-Listen Pattern

**Step 1: Initial Query**

Fetch initial file changes when component mounts:

```typescript
import { getAgentFileChanges } from "@/domains/tauri/commands";
import { listen } from "@tauri-apps/api/event";
import type { FileChangesEvent } from "@/types/agent";

// Initial query
const changes = await getAgentFileChanges(agentId, false);
setFileChanges(changes);
```

**Step 2: Listen for Updates**

Subscribe to real-time events:

```typescript
const unlisten = await listen<FileChangesEvent>("agent-file-changes", (event) => {
  // Filter for current agent
  if (event.payload.agent_id === agentId) {
    setFileChanges(event.payload.changes);
  }
});

// Cleanup on unmount
return () => {
  unlisten();
};
```

### Complete Example

```typescript
import { useEffect, useState } from "react";
import { getAgentFileChanges } from "@/domains/tauri/commands";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { FileChange, FileChangesEvent } from "@/types/agent";

export function useFileChanges(agentId: string) {
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    async function init() {
      // Initial query
      try {
        const initialChanges = await getAgentFileChanges(agentId, false);
        setChanges(initialChanges);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch file changes:", error);
        setLoading(false);
      }

      // Listen for updates
      unlisten = await listen<FileChangesEvent>(
        "agent-file-changes",
        (event) => {
          if (event.payload.agent_id === agentId) {
            setChanges(event.payload.changes);
          }
        }
      );
    }

    init();

    return () => {
      unlisten?.();
    };
  }, [agentId]);

  return { changes, loading };
}
```

### Filtering Untracked Files

```typescript
// Exclude untracked files
const changes = await getAgentFileChanges(agentId, true);

// Include untracked files (default)
const changes = await getAgentFileChanges(agentId, false);
```

### Getting File Diff Data

```typescript
import { getAgentFileDiffData } from "@/domains/tauri/commands";

const diffData = await getAgentFileDiffData(agentId, "src/main.rs");

// Access diff parts
console.log(diffData.git_diff);           // Git unified diff
console.log(diffData.old_file_content);   // File content at base branch
console.log(diffData.new_file_content);   // Current file content
```

## Data Types

### FileChange

```typescript
interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  new_path?: string; // For renames: the new path
}

type FileStatus =
  | "Modified"
  | "Added"
  | "Deleted"
  | "Renamed"
  | "Copied"
  | "Untracked";
```

### FileDiffData

```typescript
interface FileDiffData {
  git_diff: string;           // Git unified diff output
  old_file_content: string;   // File content at merge-base
  new_file_content: string;   // Current file content
}
```

### FileChangesEvent

```typescript
interface FileChangesEvent {
  agent_id: string;
  changes: FileChange[];
  timestamp: string; // ISO 8601 format
}
```

## Event Filtering

Events are emitted globally for all agents. You must filter events in the frontend:

```typescript
// ✅ CORRECT - Filter in frontend
const unlisten = await listen<FileChangesEvent>("agent-file-changes", (event) => {
  if (event.payload.agent_id === currentAgentId) {
    updateFileList(event.payload.changes);
  }
});

// ❌ WRONG - Don't try to subscribe to agent-specific events
// (This won't work - events are global)
await listen(`agent-file-changes-${agentId}`, ...);
```

## Performance Considerations

1. **Polling Frequency:** 2 seconds is a balance between responsiveness and CPU usage
2. **Change Detection:** Only emits when changes actually occur (cached comparison)
3. **Agent Filtering:** Only monitors agents in active states (Running, Idle, WaitingInput, ManualControl)
4. **Frontend Filtering:** Each component filters for its own agent to avoid unnecessary re-renders

## Troubleshooting

### Events not firing

1. Check agent status - only active agents are monitored
2. Verify agent has a valid worktree_path
3. Check browser console for errors
4. Ensure agent_id matches exactly (case-sensitive)

### Duplicate events

Events are deduplicated by the service - you should not receive duplicates unless the files actually changed again.

### Missing changes

If changes appear in git but not in events:
1. Wait 2 seconds for next poll cycle
2. Check if agent status is in monitored states
3. Verify git repository is valid in agent's worktree

## Future Enhancements

Potential improvements for future consideration:

1. **File-specific events:** Emit separate events for individual file changes
2. **Debouncing:** Group rapid changes into single events
3. **Configurable polling:** Allow users to adjust polling frequency
4. **Diff events:** Emit events when specific file diffs are requested
5. **Webhook support:** Trigger events from git hooks instead of polling
