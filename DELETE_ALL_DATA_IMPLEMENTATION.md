# Delete All Data - Implementation Guide

## ✅ Backend Complete

The backend commands have been implemented:

### 1. `calculate_worktree_disk_usage()`
Returns how much disk space worktrees are using:
```typescript
{
  total_bytes: number;
  total_mb: number;
  worktree_count: number;
}
```

### 2. `delete_all_data()`
Nuclear option - deletes everything:
- Stops all running agents
- Runs teardown scripts
- Removes all worktrees
- Clears database
- Deletes workspaces
- **Resets to onboarding**

---

## 🎨 Frontend Implementation

### Step 1: Add TypeScript types

Add to `src/domains/tauri/commands.ts`:

```typescript
export interface DiskUsageInfo {
  total_bytes: number;
  total_mb: number;
  worktree_count: number;
}

export async function calculateWorktreeDiskUsage(): Promise<DiskUsageInfo> {
  return invoke("calculate_worktree_disk_usage");
}

export async function deleteAllData(): Promise<void> {
  return invoke("delete_all_data");
}
```

### Step 2: Add UI to Settings

The best place is in **WorkspaceSettings component** or create a new **Advanced Settings** section.

Example location: `src/components/WorkspaceSettings.tsx`

Add a "Danger Zone" section at the bottom:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { calculateWorktreeDiskUsage, deleteAllData } from "@/domains/tauri/commands";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

// Add to your WorkspaceSettings component:

export function WorkspaceSettings() {
  const navigate = useNavigate();
  const [diskUsage, setDiskUsage] = useState<{ total_mb: number; worktree_count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load disk usage on mount
  useEffect(() => {
    calculateWorktreeDiskUsage().then(setDiskUsage);
  }, []);

  const handleDeleteAllData = async () => {
    if (!confirm(
      "⚠️ WARNING: This will delete ALL agents, worktrees, and data.\n\n" +
      "This action CANNOT be undone.\n\n" +
      "Type 'DELETE' to confirm."
    )) {
      return;
    }

    const confirmation = prompt("Type DELETE to confirm:");
    if (confirmation !== "DELETE") {
      toast.error("Deletion cancelled");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAllData();
      toast.success("All data deleted. Redirecting to onboarding...");

      // Redirect to onboarding after deletion
      setTimeout(() => {
        navigate({ to: "/onboarding" });
      }, 1000);
    } catch (error) {
      toast.error(`Failed to delete data: ${error}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Your existing workspace settings... */}

      <Separator className="my-8" />

      {/* Danger Zone */}
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <h3 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Irreversible actions that will delete all your data.
        </p>

        {diskUsage && (
          <div className="mb-4 p-3 rounded bg-muted text-sm">
            <div>💾 Disk Usage: <strong>{diskUsage.total_mb.toFixed(2)} MB</strong></div>
            <div>📁 Worktrees: <strong>{diskUsage.worktree_count}</strong></div>
          </div>
        )}

        <Button
          variant="destructive"
          onClick={handleDeleteAllData}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete All Data & Reset"}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          This will delete all agents, worktrees, and reset Mux to a fresh state.
        </p>
      </div>
    </div>
  );
}
```

### Step 3: Listen for `data-reset` event

The backend emits a `data-reset` event. You can optionally listen to it:

```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  const unlisten = listen("data-reset", () => {
    // Data was reset, redirect to onboarding
    navigate({ to: "/onboarding" });
  });

  return () => {
    unlisten.then((fn) => fn());
  };
}, []);
```

---

## 📝 Manual Cleanup Documentation

Add this to your README or docs:

### After Uninstalling Mux

If you've uninstalled Mux and want to completely remove all data:

```bash
# Remove database and settings
rm -rf ~/Library/Application\ Support/com.agent-coordinator.AgentCoordinator

# Remove worktrees (can be large!)
rm -rf ~/.mux

# Optional: Clean up git worktree references
# (Run in each repo you used with Mux)
cd /path/to/your/repo
git worktree prune
```

---

## 🎯 Summary

**Backend:** ✅ Complete
- `calculate_worktree_disk_usage()` - shows disk usage
- `delete_all_data()` - deletes everything and resets

**Frontend:** 🔨 Ready to implement
1. Add TypeScript types to `commands.ts`
2. Add "Danger Zone" UI to Settings
3. Show disk usage before deletion
4. Require confirmation (2-step: confirm + type DELETE)
5. Redirect to onboarding after deletion

**Docs:** 📖 Add manual cleanup instructions to README
