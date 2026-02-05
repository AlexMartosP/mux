import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSettingsQuery } from "@/domains/settings/data/settings-queries";
import { useUpdateSettings } from "@/domains/settings/data/settings-mutations";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import * as tauri from "@/domains/tauri/commands";

export const Route = createFileRoute("/settings/chat")({
  component: ChatSettings,
});

function ChatSettings() {
  const navigate = useNavigate();
  const { data: settings, isLoading } = useSettingsQuery();
  const updateSettings = useUpdateSettings();

  const [diskUsage, setDiskUsage] = useState<{ total_mb: number; worktree_count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load disk usage on mount
  useEffect(() => {
    const loadDiskUsage = async () => {
      try {
        const usage = await tauri.calculateWorktreeDiskUsage();
        setDiskUsage({ total_mb: usage.total_mb, worktree_count: usage.worktree_count });
      } catch (err) {
        console.error("Failed to calculate disk usage:", err);
      }
    };
    loadDiskUsage();
  }, []);

  if (isLoading || !settings) {
    return <div className="text-muted-foreground text-xs">Loading...</div>;
  }

  const handleSendKeyChange = (sendWithEnter: boolean) => {
    updateSettings.mutate({ ...settings, send_with_enter: sendWithEnter });
  };

  const handlePermissionsChange = (promptForPermissions: boolean) => {
    updateSettings.mutate({ ...settings, prompt_for_permissions: promptForPermissions });
  };

  const handleDeleteAllData = async () => {
    if (!confirm(
      "⚠️ WARNING: This will delete ALL agents, worktrees, and data.\n\n" +
      "This action CANNOT be undone.\n\n" +
      "Type 'DELETE' in the next prompt to confirm."
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
      await tauri.deleteAllData();
      toast.success("All data deleted. Redirecting to onboarding...");

      // Redirect to onboarding after deletion
      setTimeout(() => {
        navigate({ to: "/onboarding" });
      }, 1000);
    } catch (err) {
      toast.error(`Failed to delete data: ${err}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Send Key */}
      <section>
        <h2 className="text-xs font-medium text-foreground mb-2">SEND KEY</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Choose the keyboard shortcut to send messages.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="sendKey"
              checked={!settings.send_with_enter}
              onChange={() => handleSendKeyChange(false)}
              className="accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="text-foreground">⌘+Enter</span> to send (Enter for new line)
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="sendKey"
              checked={settings.send_with_enter}
              onChange={() => handleSendKeyChange(true)}
              className="accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="text-foreground">Enter</span> to send (Shift+Enter for new line)
            </span>
          </label>
        </div>
      </section>

      {/* Permissions */}
      <section>
        <h2 className="text-xs font-medium text-foreground mb-2">PERMISSIONS</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Control how Claude handles permission requests for file changes and commands.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.prompt_for_permissions}
              onChange={(e) => handlePermissionsChange(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              Prompt for permissions (requires hook setup)
            </span>
          </label>
        </div>
        {settings.prompt_for_permissions && (
          <div className="mt-3 p-3 text-xs bg-card border border-warning/50 rounded-md text-muted-foreground">
            <p className="text-warning">Setup required:</p>
            <p className="mt-2">Add to ~/.claude/settings.json:</p>
            <pre className="mt-2 p-2 overflow-x-auto bg-popover border border-border rounded-md">
              {`{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/agent-coordinator/scripts/permission-hook.cjs"
      }]
    }]
  }
}`}
            </pre>
          </div>
        )}
      </section>

      {/* Concurrency */}
      <section>
        <h2 className="text-xs font-medium text-foreground mb-2">CONCURRENCY</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Maximum number of tasks that can run simultaneously. Set to 0 for unlimited.
        </p>
        <input
          type="number"
          min={0}
          max={20}
          value={settings.max_concurrent_agents}
          onChange={(e) =>
            updateSettings.mutate({
              ...settings,
              max_concurrent_agents: parseInt(e.target.value) || 0,
            })
          }
          className="w-24 px-4 py-2 text-xs bg-card border border-border rounded-md text-foreground"
        />
      </section>

      {/* Danger Zone */}
      <section className="p-4 bg-destructive/5 border border-destructive/50 rounded-md">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-destructive" />
          <h2 className="text-xs font-semibold text-destructive">DANGER ZONE</h2>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Irreversible actions that will delete all your data.
        </p>

        {diskUsage && (
          <div className="mb-4 p-3 text-xs bg-card border border-border rounded-md">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">Disk Usage:</span>
              <span className="text-foreground font-medium">
                {diskUsage.total_mb.toFixed(2)} MB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worktrees:</span>
              <span className="text-foreground font-medium">
                {diskUsage.worktree_count}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={handleDeleteAllData}
          disabled={isDeleting}
          className="px-3 py-2 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDeleting ? "Deleting..." : "Delete All Data & Reset"}
        </button>

        <p className="text-xs text-muted-foreground mt-2">
          This will delete all agents, worktrees, and reset Mux to a fresh state.
        </p>
      </section>

      {updateSettings.isPending && (
        <p className="text-xs text-muted-foreground">Saving...</p>
      )}
    </div>
  );
}
